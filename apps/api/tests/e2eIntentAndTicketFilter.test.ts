import { describe, it, expect } from 'vitest';
import { evaluateOperationalGuardrails } from '../src/services/operationalGuardrails.js';
import { analyzeIntentLocally, isMachineSymptom } from '../src/ai/intentContextAnalyzer.js';

describe('End-to-End Dynamic Intent & Raise Ticket Modal Verification', () => {
  it('correctly classifies medical and emergency queries', () => {
    const med1 = evaluateOperationalGuardrails('my arm is bleeding');
    expect(med1.type).toBe('EMERGENCY');
    expect((med1 as any).category).toBe('MEDICAL_OR_INJURY');

    const med2 = analyzeIntentLocally("i'm not well and feeling dizzy");
    expect(med2.category).toBe('MEDICAL_OR_INJURY');
    expect(med2.isIndustrial).toBe(false);
  });

  it('correctly classifies PPE compliance inquiries and extracts gear', () => {
    const ppe1 = evaluateOperationalGuardrails('I left my helmet at home');
    expect(ppe1.type).toBe('PPE_OR_HR');
    expect((ppe1 as any).category).toBe('PPE_OR_SAFETY_COMPLIANCE');

    const ppe2 = analyzeIntentLocally('forgot my safety shoes, wearing sneakers');
    expect(ppe2.category).toBe('PPE_OR_SAFETY_COMPLIANCE');
    expect(ppe2.mentionedGear).toContain('Safety Boots');
  });

  it('correctly refuses irrelevant chit-chat inquiries', () => {
    const chat1 = evaluateOperationalGuardrails('who won the cricket match?');
    expect(chat1.type).toBe('OUT_OF_SCOPE');
    expect((chat1 as any).category).toBe('IRRELEVANT_CHIT_CHAT');

    const chat2 = analyzeIntentLocally('tell me a funny joke');
    expect(chat2.category).toBe('IRRELEVANT_CHIT_CHAT');
  });

  it('correctly classifies industrial machine queries', () => {
    const mach1 = analyzeIntentLocally('Centrifugal pump mechanical seal cavitation and vibration');
    expect(mach1.category).toBe('UPLOADED_MACHINE_QUERY');
    expect(mach1.isIndustrial).toBe(true);
  });

  it('accurately filters out non-machine symptoms from Raise Ticket modal', () => {
    expect(isMachineSymptom('i left my helmet at home')).toBe(false);
    expect(isMachineSymptom('my arm is bleeding')).toBe(false);
    expect(isMachineSymptom("i'm not well")).toBe(false);
    expect(isMachineSymptom('cricket match score')).toBe(false);
    expect(isMachineSymptom('who is virat kohli')).toBe(false);

    expect(isMachineSymptom('Cavitation crackling noise on PUMP-204-B suction line')).toBe(true);
    expect(isMachineSymptom('Elevated bearing vibration FFT at 120 Hz')).toBe(true);
    expect(isMachineSymptom('PUMP-204-B casing tie-bolt torque looseness')).toBe(true);
  });
});

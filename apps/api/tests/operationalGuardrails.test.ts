import { describe, it, expect } from 'vitest';
import {
  evaluateOperationalGuardrails,
  COPILOT_EMERGENCY_RESPONSE,
  COPILOT_PPE_COMPLIANCE_RESPONSE,
  COPILOT_OUT_OF_SCOPE_RESPONSE,
} from '../src/services/operationalGuardrails.js';

describe('AI Copilot — Strict Domain Guardrails, Refusal Logic, and Safety Protocol', () => {
  describe('1. Critical Plant Emergency Stop Protocol', () => {
    it('redirects on physical injury or accident', () => {
      const decision = evaluateOperationalGuardrails('A technician had an accident and is injured');
      expect(decision.type).toBe('EMERGENCY');
      if (decision.type === 'EMERGENCY') {
        expect(decision.response).toBe(COPILOT_EMERGENCY_RESPONSE);
        expect(decision.response).toContain('PRESS THE NEAREST EMERGENCY STOP (E-STOP) IMMEDIATELY');
      }
    });

    it('redirects on electric shock', () => {
      const decision = evaluateOperationalGuardrails('Worker got an electric shock from motor MCC starter');
      expect(decision.type).toBe('EMERGENCY');
      if (decision.type === 'EMERGENCY') {
        expect(decision.response).toContain('CRITICAL PLANT EMERGENCY DETECTED');
      }
    });

    it('redirects on chemical spill or fire', () => {
      const d1 = evaluateOperationalGuardrails('There is an acid chemical spill in Area 3');
      expect(d1.type).toBe('EMERGENCY');

      const d2 = evaluateOperationalGuardrails('Fire detected near compressor knock-out drum');
      expect(d2.type).toBe('EMERGENCY');
    });

    it('redirects on transliterated emergency (Hindi: aag lag gayi / chot lag gayi)', () => {
      const d = evaluateOperationalGuardrails('Machine me aag lag gayi hai jaldi aao');
      expect(d.type).toBe('EMERGENCY');
    });
  });

  describe('2. Smart Handling for Personal PPE / HR / Logistics', () => {
    it('enforces PPE compliance notice when helmet is left at home', () => {
      const decision = evaluateOperationalGuardrails('I left my helmet at home, can I still work on the line?');
      expect(decision.type).toBe('PPE_OR_HR');
      if (decision.type === 'PPE_OR_HR') {
        expect(decision.response).toBe(COPILOT_PPE_COMPLIANCE_RESPONSE);
        expect(decision.response).toContain('DO NOT enter the operational shop floor');
        expect(decision.response).toContain('Please report to your Shift Supervisor or Plant Tool Crib immediately');
      }
    });

    it('enforces PPE compliance notice when safety boots/shoes or goggles are forgotten', () => {
      const d1 = evaluateOperationalGuardrails('I forgot my safety shoes today');
      expect(d1.type).toBe('PPE_OR_HR');

      const d2 = evaluateOperationalGuardrails('I don’t have safety goggles with me');
      expect(d2.type).toBe('PPE_OR_HR');
    });

    it('refuses personal HR logistics (salary, leave, paycheck)', () => {
      const decision = evaluateOperationalGuardrails('When will this month salary be credited?');
      expect(decision.type).toBe('PPE_OR_HR');
      if (decision.type === 'PPE_OR_HR') {
        expect(decision.response).toContain('Scope & PPE Compliance Notice');
      }
    });
  });

  describe('3. Strict Refusal for Out-of-Box / Non-Industrial Queries', () => {
    it('refuses weather queries', () => {
      const decision = evaluateOperationalGuardrails('What is the weather outside today?');
      expect(decision.type).toBe('OUT_OF_SCOPE');
      if (decision.type === 'OUT_OF_SCOPE') {
        expect(decision.response).toBe(COPILOT_OUT_OF_SCOPE_RESPONSE);
        expect(decision.response).toContain('⚠️ Out of Operational Scope: I am the ForgeX Industrial AI Copilot');
      }
    });

    it('refuses sports queries', () => {
      const decision = evaluateOperationalGuardrails('Who won the cricket match yesterday?');
      expect(decision.type).toBe('OUT_OF_SCOPE');
      if (decision.type === 'OUT_OF_SCOPE') {
        expect(decision.response).toContain('built strictly for plant machinery diagnostics');
      }
    });

    it('refuses movies, entertainment, jokes', () => {
      const d1 = evaluateOperationalGuardrails('Tell me a funny joke about engineers');
      expect(d1.type).toBe('OUT_OF_SCOPE');

      const d2 = evaluateOperationalGuardrails('What is the best movie on Netflix right now?');
      expect(d2.type).toBe('OUT_OF_SCOPE');
    });

    it('refuses consumer vehicle and consumer gadget questions', () => {
      const d1 = evaluateOperationalGuardrails('How do I fix my Tesla Model 3 screen?');
      expect(d1.type).toBe('OUT_OF_SCOPE');

      const d2 = evaluateOperationalGuardrails('How to install iOS 18 on iPhone?');
      expect(d2.type).toBe('OUT_OF_SCOPE');
    });
  });

  describe('4. Legitimate Industrial Engineering Questions Pass Through', () => {
    it('allows general engineering physics questions (e.g. Bernoulli principle)', () => {
      const decision = evaluateOperationalGuardrails('What is Bernoulli principle and how does it relate to fluid velocity and pressure?');
      expect(decision.type).toBe('NONE');
    });

    it('allows equipment-specific maintenance questions', () => {
      const decision = evaluateOperationalGuardrails('What is the Closed Side Setting and toggle plate torque for Jaw Crusher CRSH-501-A?');
      expect(decision.type).toBe('NONE');
    });

    it('allows plant pump vibration questions', () => {
      const decision = evaluateOperationalGuardrails('How to inspect mechanical seal cavitation on PUMP-001?');
      expect(decision.type).toBe('NONE');
    });
  });
});

import { Router } from 'express';
import { CopilotController } from '../controllers/copilot.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { RAGQueryEngine } from '../services/ragQueryEngine.js';
import type { ISpeechToTextProvider, ITextToSpeechProvider } from '../speech/speech.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { AutoRcaSynthesisService } from '../ai/autoRcaSynthesisService.js';

export function createCopilotRouter(
  dataStore: IDataStore,
  ragEngine: RAGQueryEngine,
  speechProvider?: ISpeechToTextProvider & ITextToSpeechProvider
): Router {
  const router = Router();
  const controller = new CopilotController(dataStore, ragEngine, speechProvider);

  // All authorized members can query Copilot and view conversation threads
  router.post(
    '/query',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.query
  );

  router.get(
    '/conversations',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.listConversations
  );

  router.get(
    '/conversations/:id',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.getConversation
  );

  router.delete(
    '/conversations/:id',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.deleteConversation
  );

  router.post(
    '/messages/:id/feedback',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.submitFeedback
  );

  // Universal Industrial Voice Interaction Endpoints
  router.post(
    '/voice/transcribe',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.transcribeVoice
  );

  router.post(
    '/voice/synthesize',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.synthesizeVoice
  );

  router.get(
    '/voice/languages',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.getSupportedLanguages
  );

  // 1-Click Auto-Filled Root Cause Analysis (RCA) Ticket Synthesis
  router.post(
    '/synthesize-rca',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    (req, res) => {
      try {
        const payload = AutoRcaSynthesisService.synthesizeRca(req.body);
        res.status(200).json({
          success: true,
          message: 'Root Cause Analysis synthesized from multimodal session.',
          data: payload,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_RCA_ERROR', message: err?.message || 'Failed to synthesize RCA.' },
        });
      }
    }
  );

  return router;
}


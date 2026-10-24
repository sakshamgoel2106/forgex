import { Router } from 'express';
import { CopilotController } from '../controllers/copilot.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { RAGQueryEngine } from '../services/ragQueryEngine.js';
import type { ISpeechToTextProvider, ITextToSpeechProvider } from '../speech/speech.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

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

  return router;
}


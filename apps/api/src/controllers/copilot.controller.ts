import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { RAGQueryEngine } from '../services/ragQueryEngine.js';
import type { ISpeechToTextProvider, ITextToSpeechProvider } from '../speech/speech.interface.js';
import {
  LocalDevSpeechAdapter,
  EnterpriseAirGappedSpeechPolicyError,
  SpeechProviderUnavailableError,
} from '../speech/localDevSpeechAdapter.js';
import { SUPPORTED_SPEECH_LANGUAGES } from '../speech/speech.interface.js';
import { VectorStoreUnavailableError } from '../vector/vectorStore.interface.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';
import { isUuid } from '../utils/uuid.js';
import { MultimodalVisionService } from '../ai/multimodalVisionService.js';

const getSpeechDeploymentMode = (): 'SAAS_CLOUD' | 'ENTERPRISE_OLLAMA' | 'LOCAL_DEV' =>
  config.DEPLOYMENT_MODE === 'enterprise'
    ? 'ENTERPRISE_OLLAMA'
    : config.DEPLOYMENT_MODE === 'saas'
    ? 'SAAS_CLOUD'
    : 'LOCAL_DEV';

export class CopilotController {
  private speech: ISpeechToTextProvider & ITextToSpeechProvider;

  constructor(
    private dataStore: IDataStore,
    private ragEngine: RAGQueryEngine,
    speechProvider?: ISpeechToTextProvider & ITextToSpeechProvider
  ) {
    this.speech = speechProvider || new LocalDevSpeechAdapter(getSpeechDeploymentMode());
  }

  /**
   * POST /api/v1/copilot/query
   * Executes grounded RAG query with pre-generation authorization filtering
   */
  public query = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing authentication context' });
        return;
      }

      let {
        query,
        plantId,
        assetId,
        machineId,
        conversationId,
        imageUrl,
        imageBase64,
        visionMode,
        visionDiagnostic,
        topK,
        acousticTelemetry,
        audioBase64,
        audioMimeType,
      } = req.body;
      const rawAssetTag = req.body.assetTag;

      if (audioBase64) {
        acousticTelemetry = {
          ...(acousticTelemetry || {}),
          audioBase64,
          audioMimeType: audioMimeType || acousticTelemetry?.audioMimeType || 'audio/webm',
        };
      }

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Validation error: query is mandatory.',
        });
        return;
      }

      // Defensive Machine Resolution:
      // If machineId or assetId is an asset tag (e.g. "PUMP-001") rather than a valid UUID,
      // or if assetTag is provided, resolve the real machine record first.
      const candidateTagOrId = machineId || assetId || rawAssetTag;
      let resolvedMachine = null;
      if (candidateTagOrId) {
        resolvedMachine = await this.dataStore.getMachineById(organizationId, candidateTagOrId);
        if (!resolvedMachine && rawAssetTag) {
          resolvedMachine = await this.dataStore.getMachineByAssetTag(organizationId, rawAssetTag);
        }
      }

      let effectiveAssetTag = rawAssetTag;
      if (resolvedMachine) {
        machineId = resolvedMachine.id;
        assetId = resolvedMachine.id;
        effectiveAssetTag = resolvedMachine.assetTag;
        if (!plantId || plantId === 'GENERAL') {
          plantId = resolvedMachine.plantId;
        }
      } else {
        // If it's a UUID, keep it, otherwise avoid passing non-UUID strings to UUID columns
        if (machineId && !isUuid(machineId)) machineId = undefined;
        if (assetId && !isUuid(assetId)) assetId = undefined;
      }

      if (conversationId && !isUuid(conversationId)) {
        conversationId = undefined;
      }

      // Auto-Resolve Single-Plant Context if plantId is still not explicitly provided
      if (!plantId || plantId === 'GENERAL') {
        const orgPlants = await this.dataStore.listPlants(organizationId);
        if (orgPlants.length > 0) {
          plantId = orgPlants[0].id || orgPlants[0].code;
        }
      }

      const language = (req.body?.language || req.body?.locale || 'en-US') as string;

      // Inline Gemini Multimodal Vision analysis if image payload provided
      if ((imageBase64 || imageUrl) && !visionDiagnostic) {
        const targetImage = imageBase64 || imageUrl;
        try {
          visionDiagnostic = await MultimodalVisionService.analyzeImage({
            imageBase64: targetImage,
            visionMode: visionMode || 'COPILOT_DIAGNOSTIC',
            assetId,
            assetTag: effectiveAssetTag,
            language,
          });
        } catch (vErr: any) {
          logger.warn({ error: vErr?.message }, 'Failed to run inline visual analysis in Copilot query');
        }
      }

      const effectiveImageUrl = imageBase64 || imageUrl;

      const result = await this.ragEngine.query(
        {
          query,
          language,
          plantId: plantId || 'GENERAL',
          assetId,
          machineId,
          assetTag: effectiveAssetTag,
          conversationId,
          imageUrl: effectiveImageUrl,
          topK,
          acousticTelemetry,
          visionDiagnostic,
        } as any,
        {
          organizationId,
          userId,
          userRole: req.auth?.membership.role,
          userEmail: req.auth?.user.email,
          userAssignedPlantIds: req.auth?.membership.assignedPlantIds,
        }
      );

      await this.dataStore.recordAuditEvent({
        organizationId,
        actorUserId: userId,
        action: 'COPILOT_QUERY_EXECUTED',
        resourceType: 'CONVERSATION',
        resourceId: result.conversationId,
        metadata: {
          plantId,
          assetId,
          machineId,
          citationsCount: result.assistantMessage.citations.length,
          confidence: result.assistantMessage.confidence,
          isInsufficientEvidence: result.assistantMessage.isInsufficientEvidence,
          ticketNumber: result.assistantMessage.ticketNumber,
          hasAcousticTelemetry: Boolean(acousticTelemetry),
          acousticPattern: acousticTelemetry?.detectedPattern,
          hasVisionDiagnostic: Boolean(visionDiagnostic),
          visionSafetyStatus: visionDiagnostic?.safetyStatus,
          hasImage: Boolean(effectiveImageUrl),
        },
      });

      // Sanitize client payload: Block all internal manual names, document IDs, citations, and excerpts
      const sanitizedAssistantMessage = {
        ...result.assistantMessage,
        citations: [],
      };

      const userMessageWithTelemetry = {
        ...result.userMessage,
        acousticTelemetry: acousticTelemetry || (result.userMessage as any).acousticTelemetry,
        visionDiagnostic: visionDiagnostic || (result.userMessage as any).visionDiagnostic,
        imageUrl: effectiveImageUrl || (result.userMessage as any).imageUrl,
      };

      res.status(200).json({
        success: true,
        data: {
          conversationId: result.conversationId,
          messageId: result.assistantMessage.id,
          answer: result.assistantMessage.content,
          confidence: result.assistantMessage.confidence,
          questionMode: result.questionMode,
          citations: [],
          safetyAlerts: result.safetyAlerts || result.assistantMessage.safetyAlerts || [],
          isInsufficientEvidence: result.assistantMessage.isInsufficientEvidence,
          conflictDetected: result.assistantMessage.conflictDetected,
          conflictDetails: result.assistantMessage.conflictDetails,
          ticket: result.ticket,
          ticketId: result.assistantMessage.ticketId,
          ticketNumber: result.assistantMessage.ticketNumber,
          missingInfoTask: (result as any).missingInfoTask || null,
          userMessage: userMessageWithTelemetry,
          assistantMessage: sanitizedAssistantMessage,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to execute Copilot query');

      const isVectorStoreUnavailable =
        err instanceof VectorStoreUnavailableError ||
        err?.isVectorStoreUnavailable ||
        err?.name === 'VectorStoreUnavailableError' ||
        err?.message?.includes('VectorStoreUnavailableError') ||
        err?.message?.includes('circuit breaker is OPEN') ||
        err?.message?.includes('Qdrant vector store unreachable') ||
        err?.message?.includes('vector database is currently unreachable');

      if (isVectorStoreUnavailable) {
        const machineId = (req.body?.machineId || req.body?.assetId) as string | undefined;

        res.status(503).json({
          success: false,
          error: {
            code: 'VECTOR_STORE_UNAVAILABLE',
            message: 'Knowledge retrieval service is temporarily unavailable. Please retry in a few moments.',
            serviceStatus: 'DEGRADED',
            machineId: machineId || null,
          },
        });
        return;
      }

      const isUnavailable =
        err?.message?.includes('Enterprise Inference Failure') ||
        err?.message?.includes('Air-gapped policy') ||
        err?.message?.includes('Enterprise Air-Gap Policy') ||
        err?.message?.includes('LOCAL_MODEL_UNAVAILABLE') ||
        err?.message?.includes('Ollama HTTP Error') ||
        err?.message?.includes('ECONNREFUSED') ||
        err?.message?.includes('fetch failed');

      const statusCode =
        err?.message?.includes('Unauthorized') || err?.message?.includes('does not belong')
          ? 403
          : isUnavailable
          ? 503
          : 500;
      const errorCode =
        statusCode === 403
          ? 'PLANT_ACCESS_DENIED'
          : statusCode === 503
          ? 'LOCAL_MODEL_UNAVAILABLE'
          : 'RAG_QUERY_FAILED';
      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: isUnavailable
            ? 'Local Enterprise inference service is unreachable. Per Enterprise air-gapped security policy, requests will never fall back to external cloud models.'
            : (err?.message || 'Internal error executing Copilot query'),
        },
      });
    }
  };

  /**
   * GET /api/v1/copilot/conversations
   */
  public listConversations = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const plantId = typeof req.query.plantId === 'string' ? req.query.plantId : undefined;
      const conversations = await this.dataStore.listConversations(organizationId, userId, plantId);

      res.status(200).json({
        success: true,
        data: conversations,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list conversations');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/copilot/conversations/:id
   */
  public getConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const conversation = await this.dataStore.getConversationById(organizationId, conversationId);
      if (!conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const isSupervisory =
        userRole === 'ORGANIZATION_ADMIN' ||
        userRole === 'ORGANIZATION_OWNER' ||
        userRole === 'ENGINEER_TECHNICIAN';

      // Enforce conversation owner check for non-supervisory members (IDOR prevention)
      if (conversation.userId !== userId && !isSupervisory) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: You can only view your own conversations.',
          },
        });
        return;
      }

      // Strip citations from messages to prevent manual leakage
      if (conversation.messages) {
        for (const msg of conversation.messages) {
          msg.citations = [];
        }
      }

      res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to get conversation');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * DELETE /api/v1/copilot/conversations/:id
   */
  public deleteConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const conversation = await this.dataStore.getConversationById(organizationId, conversationId);
      if (!conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const isSupervisory =
        userRole === 'ORGANIZATION_ADMIN' ||
        userRole === 'ORGANIZATION_OWNER' ||
        userRole === 'ENGINEER_TECHNICIAN';

      // Enforce conversation owner check for non-supervisory members (IDOR prevention)
      if (conversation.userId !== userId && !isSupervisory) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: You can only delete your own conversations.',
          },
        });
        return;
      }

      const deleted = await this.dataStore.deleteConversation(organizationId, conversationId);

      res.status(200).json({
        success: true,
        data: { deleted },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to delete conversation');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * POST /api/v1/copilot/messages/:id/feedback
   * Submits engineer ground-truth rating and feedback
   */
  public submitFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { rating, comment, feedbackNotes } = req.body;
      if (!rating || !['HELPFUL', 'UNHELPFUL'].includes(rating)) {
        res.status(400).json({
          success: false,
          error: 'Validation error: rating must be HELPFUL or UNHELPFUL.',
        });
        return;
      }

      // Verify message exists and belongs to a conversation owned by the requesting tenant
      const message = await this.dataStore.getMessageWithCitations(messageId);
      if (!message) {
        res.status(404).json({ success: false, error: 'Message not found' });
        return;
      }

      const conversation = await this.dataStore.getConversationById(organizationId, message.conversationId);
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: 'Message not found or does not belong to authorized organization',
        });
        return;
      }

      const feedback = await this.dataStore.recordMessageFeedback({
        messageId,
        userId,
        rating,
        comment: comment ?? feedbackNotes ?? null,
      });

      res.status(200).json({
        success: true,
        data: {
          ...feedback,
          feedbackNotes: feedback.comment,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to submit message feedback');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * POST /api/v1/copilot/voice/transcribe
   * Speech-to-text with tag and technical term correction
   * Audio buffer processed in-memory and immediately discarded (Zero raw audio retention)
   */
  public transcribeVoice = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing authentication context' });
        return;
      }

      let audioBuffer: Buffer;
      if (Buffer.isBuffer(req.body)) {
        audioBuffer = req.body;
      } else if (req.body?.audioBase64) {
        audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
      } else if (typeof req.body?.speechText === 'string') {
        audioBuffer = Buffer.from(`SPEECH_TEXT:${req.body.speechText}`);
      } else if (typeof req.body?.text === 'string') {
        audioBuffer = Buffer.from(`SPEECH_TEXT:${req.body.text}`);
      } else {
        // Fallback dummy audio buffer for test or simulation
        audioBuffer = Buffer.from('RIFF_MOCK_AUDIO_DATA_FORGEX');
      }

      const maxAllowedSeconds = config.VOICE_MAX_DURATION_SECONDS || 120;
      const durationSeconds = typeof req.body?.durationSeconds === 'number' ? req.body.durationSeconds : undefined;
      if (durationSeconds !== undefined && durationSeconds > maxAllowedSeconds) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VOICE_MAX_DURATION_EXCEEDED',
            message: `Voice audio duration (${durationSeconds}s) exceeds maximum allowed duration limit of ${maxAllowedSeconds} seconds.`,
          },
        });
        return;
      }

      // Fetch active registered tags to assist phonetic/spelling alignment
      let knownAssetTags: string[] = [];
      try {
        const machines = await this.dataStore.listMachines(organizationId);
        knownAssetTags = machines.map((m) => m.assetTag).filter(Boolean);
      } catch {
        // Fallback gracefully
      }

      const language = (req.body?.language || req.query?.language || 'en-US') as string;
      const allowExternalCloud = Boolean(req.body?.allowExternalCloud);

      const result = await this.speech.transcribe(audioBuffer, {
        language,
        plantId: req.body?.plantId,
        assetId: req.body?.assetId,
        knownAssetTags,
        deploymentMode: req.body?.deploymentMode,
        allowExternalCloud,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to transcribe voice input');
      if (err instanceof EnterpriseAirGappedSpeechPolicyError) {
        res.status(403).json({
          success: false,
          error: {
            code: 'AIR_GAPPED_SPEECH_POLICY_VIOLATION',
            message: err.message,
          },
        });
        return;
      }
      if (err instanceof SpeechProviderUnavailableError) {
        res.status(503).json({
          success: false,
          error: {
            code: 'SPEECH_SERVICE_UNAVAILABLE',
            message: err.message,
          },
          message: err.message,
          uiMessage: err.message,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'TRANSCRIPTION_FAILED',
          message: err?.message || 'Internal error during voice transcription',
        },
      });
    }
  };

  /**
   * POST /api/v1/copilot/voice/synthesize
   * Text-to-speech audio synthesis with confidentiality disclosure controls
   */
  public synthesizeVoice = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing authentication context' });
        return;
      }

      const { text, messageId, language, voice, textOnlyMode, allowExternalCloud } = req.body;

      if (!text && !messageId) {
        res.status(400).json({
          success: false,
          error: 'Validation error: text or messageId is mandatory.',
        });
        return;
      }

      let textToSynthesize = text || '';
      let isRestricted = false;

      // If messageId provided, inspect confidentiality policy
      if (messageId) {
        const msg = await this.dataStore.getMessageWithCitations(messageId);
        if (msg) {
          textToSynthesize = textToSynthesize || msg.content;
          const userRole = req.auth?.membership?.role;
          const isSupervisory =
            userRole === 'ORGANIZATION_ADMIN' ||
            userRole === 'ORGANIZATION_OWNER' ||
            userRole === 'ENGINEER_TECHNICIAN';

          if (!isSupervisory && msg.citations && msg.citations.length > 0) {
            // Non-supervisory members get sanitized audio to prevent loud disclosure in shared plant areas
            isRestricted = true;
          }
        }
      }

      const result = await this.speech.synthesize(
        {
          text: textToSynthesize,
          messageId,
          language,
          voice,
          textOnlyMode: Boolean(textOnlyMode),
        },
        {
          isRestricted,
          userRole: req.auth?.membership?.role,
          deploymentMode: req.body?.deploymentMode,
          allowExternalCloud: Boolean(allowExternalCloud),
        }
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to synthesize voice output');
      if (err instanceof EnterpriseAirGappedSpeechPolicyError) {
        res.status(403).json({
          success: false,
          error: {
            code: 'AIR_GAPPED_SPEECH_POLICY_VIOLATION',
            message: err.message,
          },
        });
        return;
      }
      if (err instanceof SpeechProviderUnavailableError) {
        res.status(503).json({
          success: false,
          error: {
            code: 'SPEECH_SERVICE_UNAVAILABLE',
            message: err.message,
          },
          message: err.message,
          uiMessage: err.message,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'SYNTHESIS_FAILED',
          message: err?.message || 'Internal error during speech synthesis',
        },
      });
    }
  };

  /**
   * GET /api/v1/copilot/voice/languages
   * Returns supported speech languages and evaluated field accuracy
   */
  public getSupportedLanguages = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      data: SUPPORTED_SPEECH_LANGUAGES,
    });
  };
}

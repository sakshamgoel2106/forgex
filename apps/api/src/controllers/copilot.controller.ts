import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { RAGQueryEngine } from '../services/ragQueryEngine.js';
import { logger } from '../utils/logger.js';

export class CopilotController {
  constructor(
    private dataStore: IDataStore,
    private ragEngine: RAGQueryEngine
  ) {}

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

      const { query, plantId, assetId, conversationId, imageUrl, topK } = req.body;

      if (!query || !plantId) {
        res.status(400).json({
          success: false,
          error: 'Validation error: query and plantId are mandatory.',
        });
        return;
      }

      const result = await this.ragEngine.query(
        {
          query,
          plantId,
          assetId,
          conversationId,
          imageUrl,
          topK,
        },
        {
          organizationId,
          userId,
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
          citationsCount: result.assistantMessage.citations.length,
          confidence: result.assistantMessage.confidence,
          isInsufficientEvidence: result.assistantMessage.isInsufficientEvidence,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          conversationId: result.conversationId,
          messageId: result.assistantMessage.id,
          answer: result.assistantMessage.content,
          confidence: result.assistantMessage.confidence,
          citations: result.assistantMessage.citations,
          isInsufficientEvidence: result.assistantMessage.isInsufficientEvidence,
          conflictDetected: result.assistantMessage.conflictDetected,
          conflictDetails: result.assistantMessage.conflictDetails,
          userMessage: result.userMessage,
          assistantMessage: result.assistantMessage,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to execute Copilot query');
      const statusCode =
        err?.message?.includes('Unauthorized') || err?.message?.includes('does not belong')
          ? 403
          : 500;
      const errorCode = statusCode === 403 ? 'PLANT_ACCESS_DENIED' : 'RAG_QUERY_FAILED';
      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: err?.message || 'Internal error executing Copilot query',
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

      const deleted = await this.dataStore.deleteConversation(organizationId, conversationId);
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

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
}

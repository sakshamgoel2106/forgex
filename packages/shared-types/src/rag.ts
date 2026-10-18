import type { DocumentType } from './documents.js';

export type InferenceDeploymentMode = 'SAAS_CLOUD' | 'ENTERPRISE_OLLAMA' | 'LOCAL_DEV';

export type MessageSenderType = 'USER' | 'ASSISTANT' | 'SYSTEM';

export type AnswerConfidence = 'HIGH' | 'MEDIUM' | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE';

export interface Citation {
  id: string;
  messageId?: string;
  documentId: string;
  documentNumber: string;
  documentTitle: string;
  documentVersionId: string;
  revisionTag?: string;
  pageNumber: number;
  chunkId: string;
  snippet: string;
  confidenceScore: number;
  sectionHeading?: string | null;
}

export interface MessageFeedback {
  id: string;
  messageId: string;
  userId: string;
  rating: 'HELPFUL' | 'UNHELPFUL';
  comment?: string | null;
  createdAt: string;
}

export interface CopilotMessage {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  content: string;
  confidence: AnswerConfidence;
  citations: Citation[];
  isInsufficientEvidence?: boolean;
  conflictDetected?: boolean;
  conflictDetails?: string | null;
  createdAt: string;
  feedback?: MessageFeedback | null;
}

export interface Conversation {
  id: string;
  organizationId: string;
  plantId: string;
  assetId?: string | null;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: CopilotMessage[];
}

export interface RAGQueryRequest {
  conversationId?: string;
  plantId: string;
  assetId?: string | null;
  query: string;
  documentCategory?: DocumentType;
  topK?: number;
  imageUrl?: string;
}

export interface RAGQueryResponse {
  conversationId: string;
  userMessage: CopilotMessage;
  assistantMessage: CopilotMessage;
}

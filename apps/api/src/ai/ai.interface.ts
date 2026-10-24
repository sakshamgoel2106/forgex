/**
 * ForgeX AI — Phase 4: Explicit AI Service Provider Interfaces
 */

export type InferenceMode = 'SAAS_CLOUD' | 'ENTERPRISE_OLLAMA' | 'LOCAL_DEV';

// ----------------------------------------------------------------------------
// 1. Text Embeddings Interface
// ----------------------------------------------------------------------------
export interface ITextEmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  getModelName(): string;
}

// ----------------------------------------------------------------------------
// 2. Retrieval & Reranking Interface
// ----------------------------------------------------------------------------
export interface RerankCandidate {
  chunkId: string;
  documentId: string;
  documentNumber: string;
  documentTitle: string;
  documentVersionId: string;
  pageNumber: number;
  content: string;
  sectionHeading?: string | null;
  initialScore: number;
  isTable: boolean;
  isFigure: boolean;
  extractionMethod: string;
}

export interface RerankResult extends RerankCandidate {
  rerankScore: number;
}

export interface IRerankingProvider {
  rerank(query: string, candidates: RerankCandidate[], topK?: number): Promise<RerankResult[]>;
}

// ----------------------------------------------------------------------------
// 3. Text Generation Interface
// ----------------------------------------------------------------------------
export interface GenerationEvidenceItem {
  chunkId: string;
  documentId: string;
  documentNumber: string;
  documentTitle: string;
  documentVersionId: string;
  pageNumber: number;
  content: string;
  sectionHeading?: string | null;
  score: number;
}

export interface GenerationRequest {
  query: string;
  authorizedEvidence: GenerationEvidenceItem[];
  conversationHistory?: Array<{ sender: 'USER' | 'ASSISTANT'; text: string }>;
  assetContext?: { assetTag: string; name: string; area: string } | null;
  plantContext?: { code: string; name: string } | null;
  targetLanguage?: string;
  retrievalQuery?: string;
}

export interface RawCitationOutput {
  chunkId: string;
  docId: string;
  pageNumber: number;
  exactVerbatimQuote: string;
}

export interface GenerationResult {
  answerText: string;
  confidence: 'HIGH' | 'MEDIUM' | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE';
  isInsufficientEvidence: boolean;
  conflictDetected: boolean;
  conflictDetails?: string | null;
  usedEvidenceChunkIds: string[];
  rawCitations?: RawCitationOutput[];
  modelUsed: string;
}

export interface ITextGenerationProvider {
  generateAnswer(request: GenerationRequest): Promise<GenerationResult>;
  getModelIdentifier(): string;
  getDeploymentMode(): InferenceMode;
}

// ----------------------------------------------------------------------------
// 4. Multimodal Image-Capable Generation Interface
// ----------------------------------------------------------------------------
export interface MultimodalGenerationRequest extends GenerationRequest {
  imageBuffer?: Buffer;
  imageMimeType?: string;
  imageUrl?: string;
}

export interface IMultimodalGenerationProvider extends ITextGenerationProvider {
  generateWithImage(request: MultimodalGenerationRequest): Promise<GenerationResult>;
}

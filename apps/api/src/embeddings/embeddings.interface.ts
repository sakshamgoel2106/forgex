/**
 * ForgeX AI — Embedding Provider Adapter Contract
 */

export interface IEmbeddingAdapter {
  /**
   * Generates a dense vector embedding for a single text chunk
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generates dense vector embeddings for multiple text chunks
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Dimensionality of vectors produced (e.g. 1024 for BGE-M3)
   */
  getDimensions(): number;

  /**
   * Identifier of the embedding model
   */
  getModelName(): string;
}

import crypto from 'node:crypto';
import type { ExtractionMethod } from '@forgex/shared-types';
import type { ExtractedPage } from './documentParser.js';

export interface ChunkDraft {
  documentVersionId: string;
  pageNumber: number;
  chunkIndex: number;
  qdrantPointId: string;
  content: string;
  sectionHeading?: string | null;
  isTable: boolean;
  isFigure: boolean;
  extractionMethod: ExtractionMethod;
  tokenCount: number;
}

export class ContentChunker {
  private targetChunkSizeChars: number;
  private chunkOverlapChars: number;

  constructor(targetChunkSizeChars = 600, chunkOverlapChars = 100) {
    this.targetChunkSizeChars = targetChunkSizeChars;
    this.chunkOverlapChars = chunkOverlapChars;
  }

  /**
   * Deterministically converts document version pages into semantic chunks
   * with complete page provenance and idempotent Qdrant point IDs.
   */
  public chunkPages(documentVersionId: string, pages: ExtractedPage[]): ChunkDraft[] {
    const chunks: ChunkDraft[] = [];
    let overallChunkIndex = 0;

    for (const page of pages) {
      const pageChunks = this.chunkSinglePage(
        documentVersionId,
        page,
        overallChunkIndex
      );

      chunks.push(...pageChunks);
      overallChunkIndex += pageChunks.length;
    }

    return chunks;
  }

  private chunkSinglePage(
    documentVersionId: string,
    page: ExtractedPage,
    startIndex: number
  ): ChunkDraft[] {
    const results: ChunkDraft[] = [];
    const text = page.rawText.trim();

    if (!text) return [];

    // If text is within target size, keep as single chunk
    if (text.length <= this.targetChunkSizeChars) {
      results.push({
        documentVersionId,
        pageNumber: page.pageNumber,
        chunkIndex: startIndex,
        qdrantPointId: this.generateDeterministicUuid(documentVersionId, startIndex),
        content: text,
        sectionHeading: page.sectionHeadings[0] ?? null,
        isTable: page.hasTables,
        isFigure: page.extractionMethod === 'IMAGE_METADATA',
        extractionMethod: page.extractionMethod,
        tokenCount: this.approximateTokenCount(text),
      });
      return results;
    }

    // Split on paragraphs or section boundaries first
    const paragraphs = text.split(/\n\s*\n/);
    let currentBuffer = '';
    let currentHeading = page.sectionHeadings[0] ?? null;
    let localIndex = startIndex;

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      // Check if this paragraph contains a heading
      for (const h of page.sectionHeadings) {
        if (trimmedPara.includes(h)) {
          currentHeading = h;
          break;
        }
      }

      if (currentBuffer.length + trimmedPara.length > this.targetChunkSizeChars && currentBuffer.length > 0) {
        // Emit current chunk
        results.push({
          documentVersionId,
          pageNumber: page.pageNumber,
          chunkIndex: localIndex,
          qdrantPointId: this.generateDeterministicUuid(documentVersionId, localIndex),
          content: currentBuffer.trim(),
          sectionHeading: currentHeading,
          isTable: page.hasTables && /\|/.test(currentBuffer),
          isFigure: page.extractionMethod === 'IMAGE_METADATA',
          extractionMethod: page.extractionMethod,
          tokenCount: this.approximateTokenCount(currentBuffer),
        });
        localIndex++;

        // Carry over overlap
        const overlap = currentBuffer.slice(-this.chunkOverlapChars);
        currentBuffer = overlap + '\n\n' + trimmedPara;
      } else {
        currentBuffer = currentBuffer ? currentBuffer + '\n\n' + trimmedPara : trimmedPara;
      }
    }

    if (currentBuffer.trim().length > 0) {
      results.push({
        documentVersionId,
        pageNumber: page.pageNumber,
        chunkIndex: localIndex,
        qdrantPointId: this.generateDeterministicUuid(documentVersionId, localIndex),
        content: currentBuffer.trim(),
        sectionHeading: currentHeading,
        isTable: page.hasTables && /\|/.test(currentBuffer),
        isFigure: page.extractionMethod === 'IMAGE_METADATA',
        extractionMethod: page.extractionMethod,
        tokenCount: this.approximateTokenCount(currentBuffer),
      });
    }

    return results;
  }

  /**
   * Generates a deterministic UUID (RFC 4122 v4-formatted) based on sha256 hash.
   * Ensures 100% idempotent vector upserts in Qdrant across retries.
   */
  public generateDeterministicUuid(documentVersionId: string, chunkIndex: number): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${documentVersionId}:chunk:${chunkIndex}`)
      .digest('hex');

    // Format as 8-4-4-4-12 UUID
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16), // version 4
      ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20), // variant
      hash.substring(20, 32),
    ].join('-');
  }

  private approximateTokenCount(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }
}

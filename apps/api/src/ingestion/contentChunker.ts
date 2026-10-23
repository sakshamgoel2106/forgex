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
   * Preserves Markdown tables intact, never splitting mid-row, and repeats
   * table headers across multi-page or multi-chunk tables.
   */
  public chunkPages(documentVersionId: string, pages: ExtractedPage[]): ChunkDraft[] {
    const chunks: ChunkDraft[] = [];
    let overallChunkIndex = 0;
    let lastTableHeaders: string | null = null;

    for (const page of pages) {
      const { chunks: pageChunks, activeTableHeader } = this.chunkSinglePageWithTableCarryover(
        documentVersionId,
        page,
        overallChunkIndex,
        lastTableHeaders
      );

      chunks.push(...pageChunks);
      overallChunkIndex += pageChunks.length;
      lastTableHeaders = activeTableHeader;
    }

    return chunks;
  }

  private chunkSinglePageWithTableCarryover(
    documentVersionId: string,
    page: ExtractedPage,
    startIndex: number,
    previousPageTableHeader: string | null
  ): { chunks: ChunkDraft[]; activeTableHeader: string | null } {
    const results: ChunkDraft[] = [];
    let text = page.rawText.trim();

    if (!text) {
      return { chunks: [], activeTableHeader: previousPageTableHeader };
    }

    // Check if page begins with table rows continuing from previous page
    if (previousPageTableHeader && text.startsWith('|') && !text.includes('---')) {
      text = `${previousPageTableHeader}\n${text}`;
    }

    let detectedTableHeader: string | null = null;

    // Check if entire text fits in one chunk
    if (text.length <= this.targetChunkSizeChars) {
      const isTable = page.hasTables || (/\|.+\|/.test(text) && text.includes('---'));
      if (isTable) {
        const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
        if (lines.length >= 2 && lines[1].includes('---')) {
          detectedTableHeader = `${lines[0]}\n${lines[1]}`;
        }
      }
      results.push({
        documentVersionId,
        pageNumber: page.pageNumber,
        chunkIndex: startIndex,
        qdrantPointId: this.generateDeterministicUuid(documentVersionId, startIndex),
        content: text,
        sectionHeading: page.sectionHeadings[0] ?? null,
        isTable,
        isFigure: page.extractionMethod === 'IMAGE_METADATA',
        extractionMethod: page.extractionMethod,
        tokenCount: this.approximateTokenCount(text),
      });
      return { chunks: results, activeTableHeader: detectedTableHeader || previousPageTableHeader };
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

      // Check if this paragraph is a Markdown table
      const isMarkdownTable =
        /\|.+\|/.test(trimmedPara) &&
        (trimmedPara.includes('---') || trimmedPara.split('\n').filter((l) => l.trim().startsWith('|')).length >= 2);

      if (isMarkdownTable) {
        // If we have an existing text buffer, flush it first
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
          localIndex++;
          currentBuffer = '';
        }

        // Split table intact without breaking mid-row, repeating headers if needed
        const tableChunks = this.splitTableSafely(trimmedPara, this.targetChunkSizeChars);
        for (const tChunk of tableChunks) {
          results.push({
            documentVersionId,
            pageNumber: page.pageNumber,
            chunkIndex: localIndex,
            qdrantPointId: this.generateDeterministicUuid(documentVersionId, localIndex),
            content: tChunk.trim(),
            sectionHeading: currentHeading,
            isTable: true,
            isFigure: false,
            extractionMethod: page.extractionMethod,
            tokenCount: this.approximateTokenCount(tChunk),
          });
          localIndex++;
        }

        // Remember the table header for multi-page continuity
        const lines = trimmedPara.split('\n').filter((l) => l.trim().startsWith('|'));
        if (lines.length >= 2 && lines[1].includes('---')) {
          detectedTableHeader = `${lines[0]}\n${lines[1]}`;
        }
        continue;
      }

      // Standard text chunking
      if (currentBuffer.length + trimmedPara.length > this.targetChunkSizeChars && currentBuffer.length > 0) {
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

    return { chunks: results, activeTableHeader: detectedTableHeader || previousPageTableHeader };
  }

  /**
   * Splits a Markdown table into chunks safely:
   * - NEVER splits mid-row.
   * - Repeats header line and separator row at top of continued chunks.
   */
  public splitTableSafely(tableText: string, maxChunkChars: number): string[] {
    const rawLines = tableText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (rawLines.length < 3) {
      return [tableText];
    }

    const headerLine = rawLines[0];
    const separatorLine = rawLines[1].includes('---') ? rawLines[1] : '| ' + rawLines[0].split('|').slice(1, -1).map(() => '---').join(' | ') + ' |';
    const rows = rawLines[1].includes('---') ? rawLines.slice(2) : rawLines.slice(1);

    const headerBlock = `${headerLine}\n${separatorLine}\n`;
    const chunks: string[] = [];
    let currentRows: string[] = [];
    let currentLen = headerBlock.length;

    for (const row of rows) {
      if (!row.startsWith('|')) continue;

      if (currentLen + row.length + 1 > maxChunkChars && currentRows.length > 0) {
        chunks.push(`${headerBlock}${currentRows.join('\n')}`);
        currentRows = [row];
        currentLen = headerBlock.length + row.length + 1;
      } else {
        currentRows.push(row);
        currentLen += row.length + 1;
      }
    }

    if (currentRows.length > 0) {
      chunks.push(`${headerBlock}${currentRows.join('\n')}`);
    }

    return chunks.length > 0 ? chunks : [tableText];
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

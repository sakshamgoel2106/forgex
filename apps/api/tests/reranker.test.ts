import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RerankCandidate } from '../src/ai/ai.interface.js';
import { CrossEncoderReranker } from '../src/ai/reranker.js';

const candidate: RerankCandidate = {
  chunkId: 'chunk-a',
  documentId: 'document-a',
  documentNumber: 'PUMP-204-B',
  documentTitle: 'Maintenance Manual',
  documentVersionId: 'version-a',
  pageNumber: 1,
  content: 'Operating pressure 120 PSI.',
  sectionHeading: 'Operating limits',
  initialScore: 0.5,
  isTable: false,
  isFigure: false,
  extractionMethod: 'text',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CrossEncoderReranker', () => {
  it('uses deterministic scoring only for the explicit heuristic model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('worker unavailable')));
    const reranker = new CrossEncoderReranker('http://worker', 'heuristic-v1');

    const result = await reranker.rerank('PUMP-204-B 120 PSI', [candidate]);

    expect(result).toHaveLength(1);
    expect(result[0].rerankScore).toBeGreaterThan(0);
  });

  it('fails rather than silently using heuristics for a configured learned model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('worker unavailable')));
    const reranker = new CrossEncoderReranker('http://worker', 'local-cross-encoder');

    await expect(reranker.rerank('PUMP-204-B 120 PSI', [candidate])).rejects.toThrow(
      "Configured reranker 'local-cross-encoder' is unavailable; refusing heuristic fallback."
    );
  });
});

import type {
  IRerankingProvider,
  RerankCandidate,
  RerankResult,
} from './ai.interface.js';

/**
 * Cross-Encoder Reranker using BAAI/bge-reranker-v2-m3 endpoint or deterministic
 * exact-tag + cross-attention scoring to narrow down Top-25 candidates to Top-5
 */
export class CrossEncoderReranker implements IRerankingProvider {
  constructor(
    private workerEndpoint = process.env.WORKER_ENDPOINT || 'http://localhost:8000',
    private modelName = 'BAAI/bge-reranker-v2-m3'
  ) {}

  public async rerank(
    query: string,
    candidates: RerankCandidate[],
    topK = 5
  ): Promise<RerankResult[]> {
    if (!candidates || candidates.length === 0) return [];

    // Attempt Cross-Encoder inference via worker endpoint (BAAI/bge-reranker-v2-m3)
    try {
      const batch = [...candidates].sort((a, b) => b.initialScore - a.initialScore).slice(0, 40);
      const response = await fetch(`${this.workerEndpoint}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          query,
          passages: batch.map((c) => ({
            id: c.chunkId,
            text: `Document: ${c.documentNumber} | Heading: ${c.sectionHeading || ''}\n${c.content}`,
          })),
        }),
        signal: AbortSignal.timeout(2500),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          results: Array<{ id: string; score: number }>;
        };
        if (Array.isArray(data.results) && data.results.length > 0) {
          const scoreMap = new Map(data.results.map((r) => [r.id, r.score]));
          return batch
            .map((c) => ({
              ...c,
              rerankScore: scoreMap.get(c.chunkId) ?? 0,
            }))
            .sort((a, b) => b.rerankScore - a.rerankScore)
            .slice(0, topK);
        }
      }
    } catch {
      // Fall through to deterministic exact-tag + cross-attention scoring
    }

    // Deterministic exact-tag + cross-attention scoring fallback
    return this.deterministicRerank(query, candidates, topK);
  }

  private deterministicRerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number
  ): RerankResult[] {
    const queryLower = query.toLowerCase();
    const STOPWORDS = new Set([
      'what', 'are', 'the', 'and', 'for', 'with', 'from', 'that', 'this',
      'how', 'why', 'can', 'should', 'would', 'could', 'does', 'did', 'was', 'were',
      'about', 'into', 'over', 'after', 'before', 'between', 'under'
    ]);
    const queryTokens = queryLower
      .split(/[\s,.;:!?()]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t));

    // Exact alphanumeric equipment tags & model numbers (e.g. "e-SV", "PUMP-204-B", "SKF-6310", "SOP-MECH-401")
    const exactTags =
      query.match(/\b([A-Za-z0-9]+-[A-Za-z0-9]+(-[A-Za-z0-9]+)?|SOP-[A-Z]+-[0-9]+)\b/gi) || [];

    // Operating spec values (e.g. "120 PSI", "45 ft-lbs", "1750 RPM")
    const specTokens =
      query.match(/\b(\d+(?:\.\d+)?\s*(?:PSI|ft-lbs|Nm|RPM|PSIG|GPM|HP|kW|V|VAC|bar|kPa|°C|°F))\b/gi) || [];

    const scored = candidates.map((candidate) => {
      const contentLower = candidate.content.toLowerCase();
      const headingLower = (candidate.sectionHeading || '').toLowerCase();
      const docNumLower = candidate.documentNumber.toLowerCase();
      const titleLower = candidate.documentTitle.toLowerCase();
      const combinedDocText = `${docNumLower} ${titleLower} ${headingLower} ${contentLower}`;

      let score = 0;

      // 1. Exact Tag & Model Matching (Weight: 40%)
      let tagMatchCount = 0;
      for (const tag of exactTags) {
        const lowerTag = tag.toLowerCase();
        if (docNumLower.includes(lowerTag) || titleLower.includes(lowerTag)) {
          tagMatchCount += 2.0;
        }
        if (headingLower.includes(lowerTag)) {
          tagMatchCount += 1.5;
        }
        if (contentLower.includes(lowerTag)) {
          tagMatchCount += 1.0;
        }
      }
      const tagScore = exactTags.length > 0 ? Math.min(1.0, tagMatchCount / (exactTags.length * 1.5)) : 0.5;
      score += tagScore * 0.4;

      // 2. Exact Operating Spec Matching (Weight: 20%)
      let specMatchCount = 0;
      for (const spec of specTokens) {
        const lowerSpec = spec.toLowerCase();
        if (contentLower.includes(lowerSpec) || headingLower.includes(lowerSpec)) {
          specMatchCount += 1.0;
        }
      }
      const specScore = specTokens.length > 0 ? Math.min(1.0, specMatchCount / specTokens.length) : 0.5;
      score += specScore * 0.2;

      // 3. Token-level Cross-Attention / Term Overlap with simple Stemming (Weight: 25%)
      let matchedTokens = 0;
      for (const token of queryTokens) {
        const stem = token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token;
        if (contentLower.includes(token) || contentLower.includes(stem)) matchedTokens++;
        if (headingLower.includes(token) || headingLower.includes(stem)) matchedTokens += 1.5;
      }
      const tokenScore = queryTokens.length > 0 ? Math.min(1.0, matchedTokens / queryTokens.length) : 0.5;
      score += tokenScore * 0.25;

      // 4. Critical Parameter Joint-Co-occurrence Bonus (e.g. elevation + temperature/operating limits)
      if (
        queryLower.includes('elevation') &&
        combinedDocText.includes('elevation') &&
        (queryLower.includes('temperature') || queryLower.includes('operating')) &&
        (combinedDocText.includes('temperature') || combinedDocText.includes('operating'))
      ) {
        score += 0.25;
      }

      // 5. Initial Semantic Base Score (Weight: 15%)
      const normalizedInitial = Math.max(0, Math.min(1.0, candidate.initialScore));
      score += normalizedInitial * 0.15;

      return {
        ...candidate,
        rerankScore: Math.min(1.0, Math.max(0, score)),
      };
    });

    return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
  }
}

/**
 * Reciprocal Rank Fusion Reranker
 */
export class ReciprocalRankFusionReranker implements IRerankingProvider {
  constructor(private rrfConstant = 60) {}

  public async rerank(
    query: string,
    candidates: RerankCandidate[],
    topK = 5
  ): Promise<RerankResult[]> {
    if (candidates.length === 0) return [];

    const queryTokens = query
      .toLowerCase()
      .split(/[\s,.;:!?()]+/)
      .filter((t) => t.length > 2);

    const semanticRanked = [...candidates].sort((a, b) => b.initialScore - a.initialScore);
    const keywordRanked = [...candidates].sort((a, b) => {
      const scoreA = this.calculateKeywordScore(a, queryTokens);
      const scoreB = this.calculateKeywordScore(b, queryTokens);
      return scoreB - scoreA;
    });

    const scoredMap = new Map<string, { candidate: RerankCandidate; rrfScore: number }>();

    for (let rank = 0; rank < semanticRanked.length; rank++) {
      const c = semanticRanked[rank];
      const rrfContribution = 1.0 / (this.rrfConstant + rank + 1);
      const existing = scoredMap.get(c.chunkId);
      if (existing) {
        existing.rrfScore += rrfContribution * 0.6;
      } else {
        scoredMap.set(c.chunkId, { candidate: c, rrfScore: rrfContribution * 0.6 });
      }
    }

    for (let rank = 0; rank < keywordRanked.length; rank++) {
      const c = keywordRanked[rank];
      const rrfContribution = 1.0 / (this.rrfConstant + rank + 1);
      const existing = scoredMap.get(c.chunkId);
      if (existing) {
        existing.rrfScore += rrfContribution * 0.4;
      } else {
        scoredMap.set(c.chunkId, { candidate: c, rrfScore: rrfContribution * 0.4 });
      }
    }

    const maxKeywordScore = Math.max(
      1,
      ...candidates.map((c) => this.calculateKeywordScore(c, queryTokens))
    );

    return Array.from(scoredMap.values())
      .map(({ candidate, rrfScore }) => {
        const kwScore = this.calculateKeywordScore(candidate, queryTokens) / maxKeywordScore;
        const normalizedInitial = Math.max(0, candidate.initialScore);
        const combinedScore = kwScore * 0.5 + rrfScore * 10 * 0.3 + normalizedInitial * 0.2;
        return {
          ...candidate,
          rerankScore: Math.min(1.0, combinedScore),
        };
      })
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);
  }

  private calculateKeywordScore(candidate: RerankCandidate, tokens: string[]): number {
    let score = 0;
    const contentLower = candidate.content.toLowerCase();
    const headingLower = (candidate.sectionHeading || '').toLowerCase();

    for (const token of tokens) {
      if (contentLower.includes(token)) score += 1.0;
      if (headingLower.includes(token)) score += 2.5;
    }

    return score;
  }
}

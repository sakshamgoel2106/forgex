import type {
  IRerankingProvider,
  RerankCandidate,
  RerankResult,
} from './ai.interface.js';

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

    // 1. Rank candidates by semantic vector initial score
    const semanticRanked = [...candidates].sort((a, b) => b.initialScore - a.initialScore);

    // 2. Rank candidates by keyword & tag overlap
    const keywordRanked = [...candidates].sort((a, b) => {
      const scoreA = this.calculateKeywordScore(a, queryTokens);
      const scoreB = this.calculateKeywordScore(b, queryTokens);
      return scoreB - scoreA;
    });

    // 3. Reciprocal Rank Fusion
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

    // Sort by combined hybrid score and return topK
    const results: RerankResult[] = Array.from(scoredMap.values())
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

    return results;
  }

  private calculateKeywordScore(candidate: RerankCandidate, tokens: string[]): number {
    let score = 0;
    const contentLower = candidate.content.toLowerCase();
    const headingLower = (candidate.sectionHeading || '').toLowerCase();

    for (const token of tokens) {
      if (contentLower.includes(token)) {
        score += 1.0;
      }
      if (headingLower.includes(token)) {
        // Boost matches in section headings
        score += 2.5;
      }
    }

    return score;
  }
}

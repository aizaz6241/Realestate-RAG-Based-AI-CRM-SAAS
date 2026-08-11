import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from '../ai-llm.service';
import { RetrievedChunk } from './ai-rag-retrieval.service';

@Injectable()
export class AiRagRerankerService {
  private readonly logger = new Logger(AiRagRerankerService.name);

  constructor(private llmService: AiLlmService) {}

  /**
   * Lexical + structural reranking. No LLM call.
   *
   * This used to send every candidate chunk's full text to the model and ask for a
   * relevance score per chunk. That is the single most expensive call in the RAG
   * path — the prompt grows with the corpus slice, it costs a full round trip, and
   * on a small model the returned scores were barely better than the RRF ordering
   * that retrieval already produced.
   *
   * The signals below reproduce most of that ranking value for free:
   *   - RRF score from hybrid retrieval (already fuses semantic + keyword rank)
   *   - term coverage: how much of the query's content vocabulary the chunk contains
   *   - phrase hit: exact multi-word overlap, which is strong evidence
   *   - proximity: query terms appearing close together beats scattered mentions
   *
   * If you later want a genuine relevance model here, use a cross-encoder
   * (e.g. bge-reranker) rather than a chat LLM — same job, ~20ms, no tokens.
   */
  async rerank(
    query: string,
    candidates: RetrievedChunk[],
    organizationId?: string,
    userId?: string
  ): Promise<RetrievedChunk[]> {
    if (candidates.length <= 1) return candidates;

    const terms = this.contentTerms(query);
    const phrases = this.queryPhrases(query);

    const scored = candidates.map(chunk => {
      const haystack = chunk.content.toLowerCase();

      // Term coverage — fraction of distinct query terms present.
      const hits = terms.filter(t => haystack.includes(t));
      const coverage = terms.length ? hits.length / terms.length : 0;

      // Exact phrase matches are worth much more than scattered single terms.
      const phraseHits = phrases.filter(p => haystack.includes(p)).length;
      const phraseScore = phrases.length ? Math.min(1, phraseHits / phrases.length) : 0;

      // Proximity — if all matched terms sit inside a tight window, the chunk is
      // probably about the query rather than merely mentioning its words.
      const proximity = this.proximityScore(haystack, hits);

      // rrfScore is ~1/60-scale; normalise it to roughly [0,1] before blending.
      const normalizedRrf = Math.min(1, chunk.rrfScore * 30);

      const finalScore =
        0.45 * normalizedRrf +
        0.25 * coverage +
        0.20 * phraseScore +
        0.10 * proximity;

      return { ...chunk, score: finalScore };
    });

    scored.sort((a, b) => b.score - a.score);
    this.logger.log(`Lexical reranking applied to ${candidates.length} chunks (0 LLM calls).`);
    return scored;
  }

  /** Query terms worth matching on — drops stopwords in English and Roman Urdu. */
  private contentTerms(query: string): string[] {
    const stop = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'for', 'to', 'in', 'on',
      'and', 'or', 'what', 'which', 'who', 'how', 'many', 'much', 'me', 'my', 'our',
      'show', 'list', 'give', 'tell', 'find', 'get', 'all', 'any', 'from', 'with',
      'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'hai', 'hain', 'kya', 'kaun',
      'kitne', 'kitna', 'dikhao', 'batao', 'karo', 'kar', 'do', 'ap', 'aap',
    ]);
    return Array.from(new Set(
      query.toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(t => t.length > 2 && !stop.has(t))
    ));
  }

  /** Adjacent content-term bigrams, used as approximate phrase probes. */
  private queryPhrases(query: string): string[] {
    const terms = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 2);
    const phrases: string[] = [];
    for (let i = 0; i < terms.length - 1; i++) {
      phrases.push(`${terms[i]} ${terms[i + 1]}`);
    }
    return phrases;
  }

  /** 1.0 when every matched term fits in a tight window, decaying as they spread out. */
  private proximityScore(haystack: string, hits: string[]): number {
    if (hits.length < 2) return hits.length;
    const positions = hits
      .map(t => haystack.indexOf(t))
      .filter(p => p >= 0)
      .sort((a, b) => a - b);
    if (positions.length < 2) return 0;
    const span = positions[positions.length - 1] - positions[0];
    const ideal = 120; // characters
    return span <= ideal ? 1 : Math.max(0, ideal / span);
  }

  // Calculate detailed confidence score for a retrieved chunk
  calculateChunkConfidence(chunk: RetrievedChunk, query: string): number {
    // 1. Initial base score from RRF or Vector matching
    let baseScore = chunk.score;

    // 2. Freshness factor: decays exponentially over time (half-life of 180 days)
    let freshnessMultiplier = 1.0;
    const docMeta = chunk.metadata;
    if (docMeta && docMeta.ingestedAt) {
      const ageInMs = Date.now() - new Date(docMeta.ingestedAt).getTime();
      const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
      freshnessMultiplier = Math.exp(-ageInDays / 180); // decays to ~0.37 after 180 days
      // Bound decay floor so we don't completely invalidate old documents
      freshnessMultiplier = Math.max(0.4, freshnessMultiplier);
    }

    // 3. Source trust factor: official files have higher trust than notes
    let trustScore = 0.8; // default
    if (chunk.fileType === 'PDF' || chunk.fileType === 'DOCX') {
      trustScore = 1.0; // high trust
    } else if (chunk.fileType === 'NOTE') {
      trustScore = 0.75; // medium trust
    }

    // 4. Citation completeness factor: checks if page number is present
    let completeness = 0.8;
    const chunkMeta = chunk.metadata;
    if (chunkMeta && chunkMeta.page && chunkMeta.paragraph) {
      completeness = 1.0;
    }

    // Combine factors
    // Score = baseScore * 40% + trustScore * 30% + freshnessMultiplier * 20% + completeness * 10%
    const finalConfidence = 0.4 * baseScore + 0.3 * trustScore + 0.2 * freshnessMultiplier + 0.1 * completeness;
    
    // Bound result
    return Math.min(1.0, Math.max(0.0, finalConfidence));
  }

  // Calculate overall confidence score for the entire retrieved context pool
  calculateAggregateConfidence(chunks: RetrievedChunk[], query: string): number {
    if (chunks.length === 0) return 0.0;

    // Average confidence of the top-3 chunks
    const topChunks = chunks.slice(0, 3);
    const sum = topChunks.reduce((acc, chunk) => acc + this.calculateChunkConfidence(chunk, query), 0);
    const average = sum / topChunks.length;

    // Check for agreement/overlap: do retrieved chunks corroborate each other?
    // If they come from different documents, it indicates high corroboration
    const docIds = new Set(chunks.map(c => c.documentId));
    const agreementBonus = docIds.size > 1 ? 0.05 : 0.0; // minor bonus for multi-source confirmation

    return Math.min(1.0, average + agreementBonus);
  }
}

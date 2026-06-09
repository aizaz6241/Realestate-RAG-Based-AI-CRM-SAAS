import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from '../ai-llm.service';
import { RetrievedChunk } from './ai-rag-retrieval.service';

@Injectable()
export class AiRagRerankerService {
  private readonly logger = new Logger(AiRagRerankerService.name);

  constructor(private llmService: AiLlmService) {}

  // Rerank candidates using LLM cognitive evaluation or fall back to hybrid search score
  async rerank(
    query: string,
    candidates: RetrievedChunk[],
    organizationId?: string,
    userId?: string
  ): Promise<RetrievedChunk[]> {
    if (candidates.length <= 1) return candidates;

    this.logger.log(`Executing cognitive reranker on ${candidates.length} chunks...`);

    const systemPrompt = `You are a RAG Re-ranking engine for a real estate ERP.
Analyze the user query and the provided document chunks. Score each chunk's relevance to answering the query on a scale of 0.0 (entirely irrelevant) to 10.0 (directly and completely answers the query).
Output strictly a raw JSON array of objects, containing "index" (number) and "relevanceScore" (number).
Example:
[
  {"index": 0, "relevanceScore": 9.2},
  {"index": 1, "relevanceScore": 1.5}
]
Do not write markdown backticks. Output raw JSON only.`;

    const userPrompt = `User Query: "${query}"
Retrieved Chunks:
${candidates.map((c, idx) => `[Chunk ${idx}] (Source: ${c.documentName}):\n"${c.content}"`).join('\n\n')}`;

    try {
      const resultText = await this.llmService.callLLM(systemPrompt, userPrompt, [], false, organizationId, userId);
      const cleanRes = resultText.trim();
      const jsonStart = cleanRes.indexOf('[');
      const jsonEnd = cleanRes.lastIndexOf(']');

      if (jsonStart !== -1 && jsonEnd !== -1) {
        const scores = JSON.parse(cleanRes.substring(jsonStart, jsonEnd + 1)) as Array<{ index: number; relevanceScore: number }>;
        
        // Map scores back to chunks
        const scoredChunks = candidates.map((chunk, idx) => {
          const scoreObj = scores.find(s => s.index === idx);
          const cognitiveScore = scoreObj ? scoreObj.relevanceScore / 10 : 0;
          
          // Hybrid re-ranked score: 60% LLM Cognitive Score, 40% initial RRF Score
          const finalScore = 0.6 * cognitiveScore + 0.4 * chunk.rrfScore;

          return {
            ...chunk,
            score: finalScore
          };
        });

        scoredChunks.sort((a, b) => b.score - a.score);
        this.logger.log('Cognitive reranking applied successfully.');
        return scoredChunks;
      }
    } catch (err) {
      this.logger.warn(`Cognitive reranker failed: ${err.message}. Falling back to standard hybrid RRF ranking.`);
    }

    return candidates;
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

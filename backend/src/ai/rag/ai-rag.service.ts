import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiLlmService } from '../ai-llm.service';
import { AiRagIngestionService } from './ai-rag-ingestion.service';
import { AiRagRetrievalService, RetrievedChunk } from './ai-rag-retrieval.service';
import { AiRagRerankerService } from './ai-rag-reranker.service';
import { AiRagCacheService } from './ai-rag-cache.service';
import * as fs from 'fs';
import * as path from 'path';

export interface RagResponse {
  answer: string;
  confidenceScore: number;
  citations: Array<{
    documentId: string;
    documentName: string;
    fileType: string;
    page: number;
    paragraph: number;
  }>;
  traceId: string;
  cached: boolean;
  latencyMs: number;
}

@Injectable()
export class AiRagService {
  private readonly logger = new Logger(AiRagService.name);
  private readonly tracesDir = path.join(process.cwd(), 'src', 'ai', 'logs', 'rag-traces');

  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService,
    private ingestionService: AiRagIngestionService,
    private retrievalService: AiRagRetrievalService,
    private rerankerService: AiRagRerankerService,
    private cacheService: AiRagCacheService
  ) {
    // Ensure traces directory exists
    if (!fs.existsSync(this.tracesDir)) {
      fs.mkdirSync(this.tracesDir, { recursive: true });
    }
  }

  // Core Orchestration: Ingestion & Chunk Vector Indexing
  async ingestDocument(
    fileBuffer: Buffer,
    fileType: string,
    fileName: string,
    organizationId: string,
    authorId: string,
    allowedRoles: string[] = []
  ): Promise<any> {
    const startTime = Date.now();
    this.logger.log(`Beginning RAG ingestion for document: ${fileName}`);

    // 1. Extract text from document depending on mime/type
    const rawText = await this.ingestionService.parseDocument(fileBuffer, fileType, fileName);

    // 2. Index document metadata and handle duplicate/lineage tracking
    const { document, isDuplicate, duplicateOf } = await this.ingestionService.ingestDocument(
      fileName,
      rawText,
      fileType,
      fileBuffer.byteLength,
      organizationId,
      { authorId, source: 'UPLOAD', allowedRoles }
    );

    if (isDuplicate) {
      return {
        success: true,
        message: `Document "${fileName}" was already indexed (exact duplicate of ${duplicateOf}).`,
        documentId: duplicateOf,
        chunksCount: 0,
        latencyMs: Date.now() - startTime,
      };
    }

    // 3. Chunk the normalized document text
    const chunks = this.ingestionService.chunkDocument(rawText);
    this.logger.log(`Created ${chunks.length} text chunks for document: ${fileName}`);

    // 4. Embed and persist in batches.
    //
    // This used to be one embedding call + one INSERT per chunk, sequentially. For
    // a 50-page PDF that is ~200 embedding round trips plus 200 separate inserts to
    // Neon in us-east-1 — minutes of wall clock for a single upload. Now each batch
    // embeds concurrently and lands as one multi-row INSERT.
    //
    // The insert is raw SQL because `embedding` is a pgvector column, which the
    // Prisma client cannot write through the typed API.
    const BATCH_SIZE = 20;
    let createdCount = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const vectors = await this.llmService.generateEmbeddingsBatch(
        batch.map(c => c.content),
        organizationId,
        authorId
      );

      const values: string[] = [];
      const params: any[] = [];
      batch.forEach((chunk, j) => {
        const base = params.length;
        values.push(`(gen_random_uuid(), $${base + 1}, $${base + 2}::vector, $${base + 3}::jsonb, $${base + 4}, NOW())`);
        params.push(
          chunk.content,
          `[${vectors[j].join(',')}]`,
          JSON.stringify(chunk.metadata ?? {}),
          document.id
        );
      });

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "AiDocumentChunk" (id, content, embedding, metadata, "documentId", "createdAt")
         VALUES ${values.join(', ')}`,
        ...params
      );

      createdCount += batch.length;
      this.logger.log(`Indexed ${createdCount}/${chunks.length} chunks for "${fileName}".`);
    }

    const latencyMs = Date.now() - startTime;
    this.logger.log(`Indexed document successfully. Total latency: ${latencyMs}ms`);

    return {
      success: true,
      message: `Indexed "${fileName}" successfully. Generated ${createdCount} knowledge vectors.`,
      documentId: document.id,
      chunksCount: createdCount,
      latencyMs,
    };
  }

  // Core Orchestration: Secure RAG Retrieval & Constrained Response Generation
  async query(
    queryText: string,
    organizationId: string,
    userId: string,
    userRole: string,
    options: { threshold?: number; limit?: number; bypassCache?: boolean } = {}
  ): Promise<RagResponse> {
    const startTime = Date.now();
    const threshold = options.threshold ?? 0.40;
    const limit = options.limit ?? 5;
    const traceId = 'trace-' + Math.random().toString(36).substring(2, 15);

    this.logger.log(`Processing secure RAG query: "${queryText}" (Trace: ${traceId})`);

    // 1. Check Caching Layer
    const cacheKey = this.cacheService.generateKey(queryText, organizationId, limit);
    if (!options.bypassCache) {
      const cachedResponse = this.cacheService.get<RagResponse>(cacheKey);
      if (cachedResponse) {
        this.logger.log(`Returning cached response for query: "${queryText}"`);
        return {
          ...cachedResponse,
          cached: true,
          latencyMs: Date.now() - startTime,
        };
      }
    }

    // 2. Hybrid Retrieval (BM25 FTS + PGVector Cosine Similarity)
    const candidates = await this.retrievalService.retrieve(queryText, organizationId, userId, userRole, limit * 2);

    if (candidates.length === 0) {
      const latencyMs = Date.now() - startTime;
      const fallbackResponse = this.createFallbackResponse(traceId, latencyMs);
      this.saveTrace(traceId, queryText, [], 'REFUSED_EMPTY', fallbackResponse, latencyMs);
      return fallbackResponse;
    }

    // 3. Cognitive Re-ranking Layer
    const reranked = await this.rerankerService.rerank(queryText, candidates, organizationId, userId);
    const topChunks = reranked.slice(0, limit);

    // 4. Calculate Trust/Confidence Scoring
    const confidenceScore = this.rerankerService.calculateAggregateConfidence(topChunks, queryText);
    this.logger.log(`Calculated aggregate RAG confidence score: ${confidenceScore.toFixed(3)} (Threshold: ${threshold})`);

    // 5. Hallucination Fallback: If trust score is below threshold, refuse query gracefully
    if (confidenceScore < threshold) {
      const latencyMs = Date.now() - startTime;
      const fallbackResponse = this.createFallbackResponse(traceId, latencyMs, confidenceScore);
      this.saveTrace(traceId, queryText, topChunks, 'REFUSED_LOW_CONFIDENCE', fallbackResponse, latencyMs);
      return fallbackResponse;
    }

    // 6. Constrained LLM Generation
    // We supply document chunks formatted with precise Page & Paragraph numbers
    const documentContext = topChunks
      .map((c, i) => `[Doc-${i + 1}] (ID: ${c.documentId}, Name: ${c.documentName}, Page: ${c.metadata?.page || 1}, Paragraph: ${c.metadata?.paragraph || 1}):\n${c.content}`)
      .join('\n\n');

    const systemPrompt = `You are the Zorvex Corporate RAG Query Engine.
Your goal is to answer the user's query with extreme factual accuracy using ONLY the provided document context.

STRICT CONSTRAINTS (NEAR-ZERO HALLUCINATION):
1. Rely ONLY on clear facts directly mentioned in the provided context. Do NOT make assumptions, guess, extrapolate, or use external knowledge.
2. If the retrieved document context does not contain the answer, reply exactly with: "Insufficient evidence found in retrieved documents."
3. Every claim or factual statement in your response MUST be followed by a citation pointing to the specific document index, page number, and paragraph number in the format: [Doc-X, Page Y, Para Z].
4. Do NOT include any citations that are not backed by the provided documents.

Context Documents:
${documentContext}`;

    const userPrompt = `Query: "${queryText}"\nProvide a factual, citation-backed answer.`;

    const answerRaw = await this.llmService.callLLM(systemPrompt, userPrompt, [], true, organizationId, userId);
    let finalAnswer = answerRaw.trim();

    // 7. Post-Generation Citation Validation
    finalAnswer = this.validateAndPostProcessCitations(finalAnswer, topChunks);

    // If generation resulted in fallback message
    if (finalAnswer.includes('Insufficient evidence found')) {
      const latencyMs = Date.now() - startTime;
      const fallbackResponse = this.createFallbackResponse(traceId, latencyMs, confidenceScore);
      this.saveTrace(traceId, queryText, topChunks, 'LLM_FALLBACK_INSUFFICIENT', fallbackResponse, latencyMs);
      return fallbackResponse;
    }

    // Extract unique citation mappings
    const citations = topChunks.map((chunk, idx) => ({
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      fileType: chunk.fileType,
      page: chunk.metadata?.page || 1,
      paragraph: chunk.metadata?.paragraph || 1,
    }));

    const latencyMs = Date.now() - startTime;
    const successResponse: RagResponse = {
      answer: finalAnswer,
      confidenceScore,
      citations,
      traceId,
      cached: false,
      latencyMs,
    };

    // 8. Save in cache and trace logs
    this.cacheService.set(cacheKey, successResponse);
    this.saveTrace(traceId, queryText, topChunks, 'SUCCESS', successResponse, latencyMs);

    return successResponse;
  }

  // Post-processing citation validation: strips hallucinated citations
  private validateAndPostProcessCitations(answer: string, chunks: RetrievedChunk[]): string {
    // Regex matches [Doc-N, Page X, Para Y] or [Doc-N]
    const citationRegex = /\[Doc-(\d+)(?:,\s*Page\s*(\d+))?(?:,\s*Para\s*(\d+))?\]/g;
    
    return answer.replace(citationRegex, (match, docIdxStr, pageStr, paraStr) => {
      const docIdx = parseInt(docIdxStr, 10) - 1;
      
      // If the model cited a document index outside retrieved chunks pool
      if (docIdx < 0 || docIdx >= chunks.length) {
        return ''; // remove invalid citation
      }

      const chunk = chunks[docIdx];
      const actualPage = chunk.metadata?.page || 1;
      const actualPara = chunk.metadata?.paragraph || 1;

      // Correct page/para numbers based on actual chunk metadata to ensure zero citation hallucination
      return `[Doc: "${chunk.documentName}", Page ${actualPage}, Para ${actualPara}]`;
    });
  }

  private createFallbackResponse(traceId: string, latencyMs: number, confidence = 0.0): RagResponse {
    return {
      answer: 'Insufficient evidence found in retrieved documents.',
      confidenceScore: confidence,
      citations: [],
      traceId,
      cached: false,
      latencyMs,
    };
  }

  // Observability & Tracing: write JSON logs for audit & debugging
  private saveTrace(
    traceId: string,
    query: string,
    retrieved: RetrievedChunk[],
    status: string,
    response: RagResponse,
    latencyMs: number
  ): void {
    const traceLog = {
      traceId,
      timestamp: new Date().toISOString(),
      query,
      status,
      latencyMs,
      confidenceScore: response.confidenceScore,
      retrievedChunks: retrieved.map((c, i) => ({
        index: i + 1,
        chunkId: c.id,
        documentId: c.documentId,
        documentName: c.documentName,
        rrfScore: c.rrfScore,
        rawSimilarityScore: c.score,
        page: c.metadata?.page || 1,
        paragraph: c.metadata?.paragraph || 1,
      })),
      responseAnswer: response.answer,
    };

    const filePath = path.join(this.tracesDir, `${traceId}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(traceLog, null, 2));
    } catch (err) {
      this.logger.error(`Failed to write RAG observability trace: ${err.message}`);
    }
  }

  // Get active query traces
  async getTraces(): Promise<any[]> {
    try {
      const files = fs.readdirSync(this.tracesDir);
      const traces = files
        .map(file => {
          try {
            const data = fs.readFileSync(path.join(this.tracesDir, file), 'utf-8');
            return JSON.parse(data);
          } catch (e) {
            return null;
          }
        })
        .filter(t => t !== null);

      // Sort by timestamp desc
      return traces.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (err) {
      this.logger.error(`Failed to list RAG traces: ${err.message}`);
      return [];
    }
  }
}

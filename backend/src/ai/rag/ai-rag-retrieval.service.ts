import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiLlmService } from '../ai-llm.service';

export interface RetrievedChunk {
  id: string;
  content: string;
  documentId: string;
  documentName: string;
  fileType: string;
  metadata: any;
  score: number;
  rrfScore: number;
  vectorRank: number | null;
  keywordRank: number | null;
}

@Injectable()
export class AiRagRetrievalService {
  private readonly logger = new Logger(AiRagRetrievalService.name);

  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService
  ) {}

  // Hybrid search combining PGVector & Full-Text Search with RRF ranking and secure access checks
  async retrieve(
    query: string,
    organizationId: string,
    userId: string,
    userRole: string,
    limit = 10
  ): Promise<RetrievedChunk[]> {
    this.logger.log(`Initiating secure hybrid retrieval for query: "${query}" (User: ${userId}, Role: ${userRole})`);

    // 1. Generate query embedding. Throws if the provider is down — callers need
    //    to know that, because a failed embedding means retrieval is degraded to
    //    keyword-only, not that the corpus has no answer.
    const queryVector = await this.llmService.generateEmbedding(query, organizationId, userId);
    const vectorString = `[${queryVector.join(',')}]`;

    // Both halves are independent — run them concurrently rather than back to back.
    // Each is one round trip to Neon (us-east-1), so this halves retrieval latency.
    const [vectorResults, keywordResults] = await Promise.all([
      // 2. Vector similarity. NOTE: no `::vector` cast on c.embedding — the column
      //    is a native vector(768) now. Casting per row made the ORDER BY
      //    non-indexable and forced a full scan on every query.
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT c.id, c.content, c."documentId", c.metadata, d.name as "documentName", d."fileType",
               1 - (c.embedding <=> $1::vector) as score
        FROM "AiDocumentChunk" c
        JOIN "AiDocument" d ON c."documentId" = d.id
        WHERE d."organizationId" = $2
          AND c.embedding IS NOT NULL
          AND (
            d."createdById" = $3
            OR d.metadata->'allowedRoles' IS NULL
            OR jsonb_array_length(d.metadata->'allowedRoles') = 0
            OR d.metadata->'allowedRoles' ? $4
            OR d.metadata->'allowedUsers' ? $3
          )
        ORDER BY c.embedding <=> $1::vector ASC
        LIMIT $5
      `, vectorString, organizationId, userId, userRole, limit * 2),

      // 3. Keyword search via native PG FTS ('simple' parser so Roman Urdu and
      //    mixed-language content isn't mangled by English stemming).
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT c.id, c.content, c."documentId", c.metadata, d.name as "documentName", d."fileType",
               ts_rank_cd(to_tsvector('simple', c.content), plainto_tsquery('simple', $1)) as score
        FROM "AiDocumentChunk" c
        JOIN "AiDocument" d ON c."documentId" = d.id
        WHERE d."organizationId" = $2
          AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $1)
          AND (
            d."createdById" = $3
            OR d.metadata->'allowedRoles' IS NULL
            OR jsonb_array_length(d.metadata->'allowedRoles') = 0
            OR d.metadata->'allowedRoles' ? $4
            OR d.metadata->'allowedUsers' ? $3
          )
        ORDER BY score DESC
        LIMIT $5
      `, query, organizationId, userId, userRole, limit * 2),
    ]);

    this.logger.log(`Retrieval candidates fetched. Vector: ${vectorResults.length}, Keyword: ${keywordResults.length}`);

    // 4. Merge results using Reciprocal Rank Fusion (RRF)
    const rrfMap = new Map<string, { chunk: any; vectorRank?: number; keywordRank?: number; score: number }>();

    vectorResults.forEach((doc, idx) => {
      rrfMap.set(doc.id, {
        chunk: doc,
        vectorRank: idx + 1,
        score: 0
      });
    });

    keywordResults.forEach((doc, idx) => {
      if (rrfMap.has(doc.id)) {
        rrfMap.get(doc.id)!.keywordRank = idx + 1;
      } else {
        rrfMap.set(doc.id, {
          chunk: doc,
          keywordRank: idx + 1,
          score: 0
        });
      }
    });

    const k = 60; // constant for RRF smoothing
    const merged: RetrievedChunk[] = [];

    rrfMap.forEach((val) => {
      const vScore = val.vectorRank ? 1 / (k + val.vectorRank) : 0;
      const kScore = val.keywordRank ? 1 / (k + val.keywordRank) : 0;
      const rrfScore = vScore + kScore;

      merged.push({
        id: val.chunk.id,
        content: val.chunk.content,
        documentId: val.chunk.documentId,
        documentName: val.chunk.documentName,
        fileType: val.chunk.fileType,
        metadata: val.chunk.metadata,
        score: val.chunk.score || 0,
        rrfScore,
        vectorRank: val.vectorRank || null,
        keywordRank: val.keywordRank || null
      });
    });

    // Sort by RRF score descending
    merged.sort((a, b) => b.rrfScore - a.rrfScore);

    this.logger.log(`Hybrid RRF retrieval merged ${merged.length} unique candidates.`);
    return merged.slice(0, limit);
  }

  // Distinguishes "the corpus has nothing relevant" from "retrieval is broken".
  // The old code collapsed both into an empty array, which is why a missing
  // pgvector extension looked exactly like an empty knowledge base.
  async diagnose(organizationId: string): Promise<{
    healthy: boolean;
    pgvectorInstalled: boolean;
    chunkCount: number;
    embeddedChunkCount: number;
    problems: string[];
  }> {
    const problems: string[] = [];
    let pgvectorInstalled = false;
    let chunkCount = 0;
    let embeddedChunkCount = 0;

    try {
      const ext = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT 1 FROM pg_extension WHERE extname = 'vector'`
      );
      pgvectorInstalled = ext.length > 0;
      if (!pgvectorInstalled) {
        problems.push('pgvector extension is not installed. Run: npm run db:pgvector');
      }
    } catch (err) {
      problems.push(`Could not check pgvector: ${err.message}`);
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::int AS total,
               COUNT(c.embedding)::int AS embedded
        FROM "AiDocumentChunk" c
        JOIN "AiDocument" d ON c."documentId" = d.id
        WHERE d."organizationId" = $1
      `, organizationId);
      chunkCount = rows[0]?.total ?? 0;
      embeddedChunkCount = rows[0]?.embedded ?? 0;

      if (chunkCount === 0) {
        problems.push('No document chunks indexed for this organization. Upload a document first.');
      } else if (embeddedChunkCount < chunkCount) {
        problems.push(`${chunkCount - embeddedChunkCount} of ${chunkCount} chunks have no embedding — re-ingest those documents.`);
      }
    } catch (err) {
      problems.push(`Could not count chunks: ${err.message}`);
    }

    try {
      await this.llmService.generateEmbedding('healthcheck', organizationId);
    } catch (err) {
      problems.push(`Embedding provider unavailable: ${err.message}`);
    }

    return {
      healthy: problems.length === 0,
      pgvectorInstalled,
      chunkCount,
      embeddedChunkCount,
      problems,
    };
  }
}

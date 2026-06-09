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

    try {
      // 1. Generate query embedding
      const queryVector = await this.llmService.generateEmbedding(query, organizationId, userId);
      const vectorString = `[${queryVector.join(',')}]`;

      // 2. Execute vector similarity search via raw PGVector <=> cosine distance
      // We filter by organizationId and access permissions (creator, role matches, user matches, or empty restrictions)
      const vectorResults = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT c.id, c.content, c."documentId", c.metadata, d.name as "documentName", d."fileType",
               1 - (c.embedding::vector <=> $1::vector) as score
        FROM "AiDocumentChunk" c
        JOIN "AiDocument" d ON c."documentId" = d.id
        WHERE d."organizationId" = $2
          AND (
            d."createdById" = $3 
            OR d.metadata->'allowedRoles' IS NULL 
            OR jsonb_array_length(d.metadata->'allowedRoles') = 0 
            OR d.metadata->'allowedRoles' ? $4
            OR d.metadata->'allowedUsers' ? $3
          )
        ORDER BY c.embedding::vector <=> $1::vector ASC
        LIMIT $5
      `, vectorString, organizationId, userId, userRole, limit * 2);

      // 3. Execute keyword similarity search via native PG FTS (simple parser for multilingual compatibility)
      const keywordResults = await this.prisma.$queryRawUnsafe<any[]>(`
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
      `, query, organizationId, userId, userRole, limit * 2);

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

      rrfMap.forEach((val, id) => {
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

    } catch (err) {
      this.logger.error(`Error during secure RAG retrieval: ${err.message}`);
      return [];
    }
  }
}

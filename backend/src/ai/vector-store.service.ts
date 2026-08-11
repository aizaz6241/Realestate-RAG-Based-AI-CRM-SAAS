import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiLlmService } from './ai-llm.service';

/**
 * Single owner of every pgvector read and write.
 *
 * Two reasons this exists rather than raw SQL scattered across services:
 *
 *  1. `embedding` is a pgvector column, so the Prisma typed client cannot read or
 *     write it. Every call site had to hand-roll SQL, and they drifted apart.
 *
 *  2. The previous similarity searches loaded *every* row for the tenant into Node
 *     and ran cosine similarity in JavaScript. That is O(rows) network transfer of
 *     768-float arrays on every question asked. These queries push the work into
 *     Postgres where the HNSW index can serve it.
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService
  ) {}

  /** pgvector literal form: [0.1,0.2,...] */
  private toVectorLiteral(vec: number[]): string {
    return `[${vec.join(',')}]`;
  }

  // ---------------------------------------------------------------------------
  // Document chunks
  // ---------------------------------------------------------------------------

  /**
   * Embeds and inserts chunks in batches. Returns the number of rows written.
   * Throws if the embedding provider is unavailable — a partially indexed
   * document is better surfaced than silently accepted.
   */
  async insertDocumentChunks(
    documentId: string,
    chunks: { content: string; metadata?: any }[],
    organizationId?: string,
    userId?: string,
    batchSize = 20
  ): Promise<number> {
    let written = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const vectors = await this.llmService.generateEmbeddingsBatch(
        batch.map(c => c.content),
        organizationId,
        userId
      );

      const values: string[] = [];
      const params: any[] = [];

      batch.forEach((chunk, j) => {
        const base = params.length;
        values.push(
          `(gen_random_uuid(), $${base + 1}, $${base + 2}::vector, $${base + 3}::jsonb, $${base + 4}, NOW())`
        );
        params.push(
          chunk.content,
          this.toVectorLiteral(vectors[j]),
          JSON.stringify(chunk.metadata ?? {}),
          documentId
        );
      });

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "AiDocumentChunk" (id, content, embedding, metadata, "documentId", "createdAt")
         VALUES ${values.join(', ')}`,
        ...params
      );

      written += batch.length;
    }

    this.logger.log(`Inserted ${written} chunk vector(s) for document ${documentId}.`);
    return written;
  }

  /**
   * Tenant-scoped nearest-neighbour search over document chunks.
   * `minScore` is cosine similarity in [0,1], not distance.
   */
  async searchDocumentChunks(
    query: string,
    organizationId: string,
    limit = 5,
    minScore = 0.25,
    userId?: string
  ): Promise<any[]> {
    const queryVector = await this.llmService.generateEmbedding(query, organizationId, userId);

    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.id, c.content, c."documentId", c.metadata,
             d.name AS "documentName", d."fileType",
             1 - (c.embedding <=> $1::vector) AS score
      FROM "AiDocumentChunk" c
      JOIN "AiDocument" d ON c."documentId" = d.id
      WHERE d."organizationId" = $2
        AND c.embedding IS NOT NULL
        AND 1 - (c.embedding <=> $1::vector) > $3
      ORDER BY c.embedding <=> $1::vector ASC
      LIMIT $4
    `, this.toVectorLiteral(queryVector), organizationId, minScore, limit);
  }

  // ---------------------------------------------------------------------------
  // Memory vectors
  // ---------------------------------------------------------------------------

  async insertMemoryVector(
    content: string,
    category: string,
    organizationId: string,
    links: { clientId?: string; userId?: string; propertyId?: string } = {},
    embedderUserId?: string
  ): Promise<void> {
    const vector = await this.llmService.generateEmbedding(content, organizationId, embedderUserId);

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "AiMemoryVector"
        (id, category, content, embedding, "organizationId", "clientId", "userId", "propertyId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, $3::vector, $4, $5, $6, $7, NOW(), NOW())
    `,
      category,
      content,
      this.toVectorLiteral(vector),
      organizationId,
      links.clientId ?? null,
      links.userId ?? null,
      links.propertyId ?? null
    );
  }

  /**
   * Nearest-neighbour search over memories, with TTL enforced in SQL.
   *
   * The old implementation fetched every memory row, then filtered by TTL and
   * classification in Node. Classification is derived from content/category, so
   * it can be expressed as a CASE — which means Postgres can discard expired and
   * non-FACT rows before they ever cross the wire.
   */
  async searchMemories(
    query: string,
    organizationId: string,
    limit = 5,
    minScore = 0.3
  ): Promise<{ id: string; category: string; content: string; score: number; createdAt: Date }[]> {
    const queryVector = await this.llmService.generateEmbedding(query, organizationId);

    // Mirrors getMemoryClassification() in ai.service.ts. Only FACT memories are
    // eligible for retrieval context; the rest are state that must not leak
    // across turns.
    return this.prisma.$queryRawUnsafe<any[]>(`
      WITH classified AS (
        SELECT id, category, content, embedding, "createdAt",
          CASE
            WHEN lower(content) LIKE '%count%'
              OR lower(content) LIKE '%headcount%'
              OR lower(content) LIKE '%total number%'
              OR lower(content) LIKE '%currently at%'
              OR lower(content) LIKE '%there is a lack of%'
              THEN 'TEMPORARY_STATE'
            WHEN category LIKE 'PATTERN:%' OR category = 'OBSERVATION'
              THEN 'OBSERVATION'
            WHEN category = 'INSIGHT'
              OR lower(content) LIKE '%trend%'
              OR lower(content) LIKE '%preference%'
              THEN 'INSIGHT'
            ELSE 'FACT'
          END AS classification
        FROM "AiMemoryVector"
        WHERE "organizationId" = $2
          AND embedding IS NOT NULL
      )
      SELECT id, category, content, "createdAt",
             1 - (embedding <=> $1::vector) AS score
      FROM classified
      WHERE classification = 'FACT'
        AND "createdAt" > NOW() - INTERVAL '90 days'
        AND 1 - (embedding <=> $1::vector) > $3
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $4
    `, this.toVectorLiteral(queryVector), organizationId, minScore, limit);
  }

  /**
   * Deletes memories past their classification TTL. Previously this happened
   * lazily inside the read path, one DELETE per expired row per query.
   * Call it from a cron instead.
   */
  async evictExpiredMemories(organizationId?: string): Promise<number> {
    const scope = organizationId ? `AND "organizationId" = $1` : '';
    const params = organizationId ? [organizationId] : [];

    return this.prisma.$executeRawUnsafe(`
      DELETE FROM "AiMemoryVector"
      WHERE (
        (lower(content) LIKE '%count%'
          OR lower(content) LIKE '%headcount%'
          OR lower(content) LIKE '%total number%'
          OR lower(content) LIKE '%currently at%'
          OR lower(content) LIKE '%there is a lack of%')
        AND "createdAt" < NOW() - INTERVAL '5 minutes'
      )
      OR (
        (category LIKE 'PATTERN:%' OR category = 'OBSERVATION')
        AND "createdAt" < NOW() - INTERVAL '1 hour'
      )
      OR (
        (category = 'INSIGHT'
          OR lower(content) LIKE '%trend%'
          OR lower(content) LIKE '%preference%')
        AND "createdAt" < NOW() - INTERVAL '24 hours'
      )
      OR "createdAt" < NOW() - INTERVAL '90 days'
      ${scope}
    `, ...params);
  }
}

-- =============================================================================
-- 001_pgvector.sql — Enable pgvector and convert embedding columns to real vectors
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- The RAG retrieval query has always been written against pgvector operators
-- (`embedding <=> $1::vector`), but the columns were declared `Float[]`
-- (double precision[]) and the extension was never installed. Two consequences:
--
--   1. If `vector` is missing, the query throws `type "vector" does not exist`.
--      ai-rag-retrieval.service.ts caught that and returned [], so document
--      search silently answered "no evidence found" for every single query.
--
--   2. Even with the extension present, casting `embedding::vector` per row
--      makes the expression non-indexable — every query became a full table
--      scan plus N casts.
--
-- This script installs the extension, converts both embedding columns to a
-- native `vector(768)` type, and builds HNSW cosine indexes so retrieval is
-- an index scan.
--
-- RUN IT WITH:  npm run db:pgvector      (see package.json)
--
-- IDEMPOTENT: safe to run more than once.
--
-- DIMENSION: 768 matches nomic-embed-text and Gemini text-embedding-004.
-- If you set EMBEDDING_DIMENSIONS to something else, change vector(768) here
-- AND in schema.prisma, then re-embed every row — vectors from different
-- models are not comparable.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- AiDocumentChunk.embedding : double precision[] -> vector(768)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  col_type text;
  bad_rows bigint;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'AiDocumentChunk' AND column_name = 'embedding';

  IF col_type IS NULL THEN
    RAISE NOTICE 'AiDocumentChunk.embedding not found — skipping.';
    RETURN;
  END IF;

  IF col_type = 'ARRAY' THEN
    RAISE NOTICE 'Converting AiDocumentChunk.embedding from array to vector(768)...';

    -- Rows whose stored vector is the wrong width, or is the all-zero vector the
    -- old error path used to write, cannot be converted. They are unusable for
    -- similarity search regardless, so drop them and let re-ingestion refill.
    DELETE FROM "AiDocumentChunk"
    WHERE embedding IS NULL
       OR array_length(embedding, 1) IS DISTINCT FROM 768
       OR NOT EXISTS (
            SELECT 1 FROM unnest(embedding) AS v WHERE v <> 0
          );

    GET DIAGNOSTICS bad_rows = ROW_COUNT;
    IF bad_rows > 0 THEN
      RAISE NOTICE 'Deleted % unusable chunk(s) (wrong dimension or all-zero vector). Re-upload those documents.', bad_rows;
    END IF;

    -- float8[] renders as {1,2,3}; vector input syntax is [1,2,3].
    ALTER TABLE "AiDocumentChunk"
      ALTER COLUMN embedding TYPE vector(768)
      USING replace(replace(embedding::text, '{', '['), '}', ']')::vector;

    RAISE NOTICE 'AiDocumentChunk.embedding converted.';
  ELSE
    RAISE NOTICE 'AiDocumentChunk.embedding already type %, skipping conversion.', col_type;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- AiMemoryVector.embedding : double precision[] -> vector(768)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  col_type text;
  bad_rows bigint;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'AiMemoryVector' AND column_name = 'embedding';

  IF col_type IS NULL THEN
    RAISE NOTICE 'AiMemoryVector.embedding not found — skipping.';
    RETURN;
  END IF;

  IF col_type = 'ARRAY' THEN
    RAISE NOTICE 'Converting AiMemoryVector.embedding from array to vector(768)...';

    DELETE FROM "AiMemoryVector"
    WHERE embedding IS NULL
       OR array_length(embedding, 1) IS DISTINCT FROM 768
       OR NOT EXISTS (
            SELECT 1 FROM unnest(embedding) AS v WHERE v <> 0
          );

    GET DIAGNOSTICS bad_rows = ROW_COUNT;
    IF bad_rows > 0 THEN
      RAISE NOTICE 'Deleted % unusable memory vector(s).', bad_rows;
    END IF;

    ALTER TABLE "AiMemoryVector"
      ALTER COLUMN embedding TYPE vector(768)
      USING replace(replace(embedding::text, '{', '['), '}', ']')::vector;

    RAISE NOTICE 'AiMemoryVector.embedding converted.';
  ELSE
    RAISE NOTICE 'AiMemoryVector.embedding already type %, skipping conversion.', col_type;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
-- HNSW over cosine distance. Chosen over IVFFlat because it needs no training
-- step and stays accurate as rows are added incrementally — which is how
-- documents actually arrive here.
CREATE INDEX IF NOT EXISTS "AiDocumentChunk_embedding_hnsw_idx"
  ON "AiDocumentChunk" USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "AiMemoryVector_embedding_hnsw_idx"
  ON "AiMemoryVector" USING hnsw (embedding vector_cosine_ops);

-- Supports the keyword half of hybrid retrieval. 'simple' (not 'english') so
-- Roman Urdu and mixed-language content are not stemmed into nonsense.
CREATE INDEX IF NOT EXISTS "AiDocumentChunk_content_fts_idx"
  ON "AiDocumentChunk" USING gin (to_tsvector('simple', content));

-- Tenant scoping and the documentId join both filter on these.
CREATE INDEX IF NOT EXISTS "AiDocumentChunk_documentId_idx"
  ON "AiDocumentChunk" ("documentId");

CREATE INDEX IF NOT EXISTS "AiMemoryVector_organizationId_idx"
  ON "AiMemoryVector" ("organizationId");

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  has_ext boolean;
  chunk_type text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') INTO has_ext;
  SELECT data_type INTO chunk_type
  FROM information_schema.columns
  WHERE table_name = 'AiDocumentChunk' AND column_name = 'embedding';

  IF NOT has_ext THEN
    RAISE EXCEPTION 'pgvector extension is still missing after migration.';
  END IF;

  RAISE NOTICE '=== pgvector ready. AiDocumentChunk.embedding type: % ===', chunk_type;
END $$;

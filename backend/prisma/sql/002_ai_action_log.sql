-- =============================================================================
-- 002_ai_action_log.sql — Audit trail for AI-performed actions
-- =============================================================================
--
-- Applied as raw SQL rather than `prisma db push` on purpose: the embedding columns
-- are declared `Unsupported("vector(768)")`, and letting push reconcile those risks
-- rewriting working pgvector columns. This statement is purely additive.
--
-- RUN IT WITH:  npm run db:action-log
-- IDEMPOTENT: safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "AiActionLog" (
  id             TEXT PRIMARY KEY,
  action         TEXT NOT NULL,
  status         TEXT NOT NULL,
  params         JSONB,
  summary        TEXT,
  "errorMessage" TEXT,
  "actorRole"    TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Cascade so an audit row never outlives — or blocks deletion of — its tenant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AiActionLog_organizationId_fkey'
  ) THEN
    ALTER TABLE "AiActionLog"
      ADD CONSTRAINT "AiActionLog_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AiActionLog_userId_fkey'
  ) THEN
    ALTER TABLE "AiActionLog"
      ADD CONSTRAINT "AiActionLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
  END IF;
END $$;

-- "What did the AI do in this org lately?" is the query this table exists to answer.
CREATE INDEX IF NOT EXISTS "AiActionLog_organizationId_createdAt_idx"
  ON "AiActionLog" ("organizationId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AiActionLog_userId_idx"
  ON "AiActionLog" ("userId");

DO $$
DECLARE
  present boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'AiActionLog'
  ) INTO present;

  IF NOT present THEN
    RAISE EXCEPTION 'AiActionLog was not created.';
  END IF;

  RAISE NOTICE '=== AiActionLog ready ===';
END $$;

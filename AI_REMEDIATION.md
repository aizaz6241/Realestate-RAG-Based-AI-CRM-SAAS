# Zorvex AI — Remediation Report

Diagnosis and repair of the AI pipeline (database + document question answering).
Everything below was measured, not estimated. Reproduce with the commands in
[Verification](#verification).

---

## The three real problems

The layered architecture was sound. Three things were wrong underneath it.

### 1. Every layer was a separate LLM round trip

A single question triggered **12–18 sequential LLM calls**, each with a **180-second**
timeout (`AbortSignal.timeout(180000)`). Most of those calls asked the model to do
work that needs no model at all:

| Layer | Was | Why it didn't need an LLM |
|---|---|---|
| Cognitive Gateway → Query Understanding → Planning | 3 calls | All three read the same inputs and produced one combined decision |
| SQL "Critic" validation + repair loop | 1–5 calls | Its brief was "do these tables/columns exist" — a set-membership test |
| RAG reranker | 1 call | Sent every chunk's full text to score relevance; RRF already ranked them |
| Zero-Hallucination audit + regeneration | 1–3 calls | Asked a small model to check arithmetic against rows already in memory |
| Autonomous Workflow + KPI engines | 2 calls | Restated conditions the code had already detected |
| Result Fusion cross-validation | 1 call | Composer is already told live data outranks documents |
| Greeting / help replies | 1 call | Fixed-shape responses |

### 2. Document search could never work

Four independent faults, each of which alone would have been fatal:

- **`embedding` was `Float[]`, not a `vector` column.** The retrieval query casts
  `c.embedding::vector` per row, which makes the `ORDER BY` non-indexable — every
  document question was a full table scan plus N casts. (pgvector 0.8.0 *was*
  installed on Neon, so the operator worked; it just could never use an index.)
- **Embeddings were requested from OpenRouter**, which has no `/embeddings`
  endpoint. Every embedding call failed.
- **Failure returned a 3072-dim zero vector** instead of throwing, and the ingestion
  path wrote it to the database. A zero vector is equidistant from every query, so it
  pollutes results permanently while the upload reports success.
- **Retrieval swallowed its own errors** (`catch { return [] }`), making a broken
  pipeline indistinguishable from an empty knowledge base. Every document question
  answered "Insufficient evidence found."

`cosineSimilarity` compounded this by truncating to `Math.min(a.length, b.length)`,
so mismatched dimensions produced plausible-looking garbage scores rather than an
error.

### 3. Correct answers were being discarded

- The **confidence gate** refused any answer scoring under 85 on a heuristic, replacing
  it with `"Insufficient evidence available to answer confidently."` A clean query
  returning "1 property" could score below that. An empty result set is a *valid
  answer*, not low confidence.
- The **grounding check never ran on the main path**. It lived in `compileFinalResponse`,
  reachable only through the action-approval flow. The path users actually hit shipped
  composer output unchecked, despite the architecture documenting a
  "Zero Hallucination Validation Engine".

### Also found

- **A live OpenRouter API key hardcoded** in `ai-new-llm.service.ts:53` as a fallback.
- **`ai-new/` did not compile** — `safeSql` was referenced outside its scope.
- Memory search loaded **every** memory row for the tenant and scored it in JavaScript,
  issuing one `DELETE` per expired row on the read path.
- Document search ran on **every** request, including pure database lookups.
- `IntelligentCacheService` existed but nothing on the query path ever called `get`.

---

## What changed

### LLM chain: 12–18 calls → 2–3

- **`unified-planner.service.ts`** — normalize + classify + plan in one call.
  Greetings, thanks and help requests are matched deterministically and cost **zero**
  calls. Includes a plan/classification consistency repair: if the model says it needs
  the database but emits no SQL node, that's fixed rather than silently retrieving nothing.
- **`fact-verifier.service.ts`** — deterministic grounding check. Verifies numeric
  claims against per-column values (sums, means, min/max are accepted as derivable),
  named entities against retrieved rows, empty-result fabrication, and entity-type
  claims (leave/payroll/attendance) against the tables actually queried. 13 pinned test cases.
- **`validateQueryPlanAgainstSchema`** — replaces the LLM critic. Relation-aware, so
  legitimate multi-hop filters like `{ employeeProfile: { user: { name: … } } }` validate
  correctly. Suggests the nearest real column on a typo. Note the old critic returned
  `{ isValid: true }` on a parse failure — a flaky model silently waved bad plans through.
- **`normalizeGeneratedPlan`** — translates SQL-flavoured output (`count(id)`,
  `SUM(price)`) instead of rejecting it. This was found live: the model answered
  "how many properties" with `metrics: ["count(id)"]`, which failed validation, failed
  repair, and surfaced as an error.
- Reranker is now lexical (term coverage + phrase hits + proximity + RRF).
- Workflow suggestions and KPI commentary are templated from conditions already computed.
- Timeouts 180s → 20s; retries 1 → 3 with exponential backoff, and only for 429/5xx.
- `forceCloud` is now honoured — it was accepted and ignored, so every caller asking
  for the strong tier silently got the small model.

### Document pipeline

- `prisma/sql/001_pgvector.sql` — real `vector(768)` columns, HNSW cosine indexes, GIN
  FTS index. Idempotent. Applied: both columns are `vector`, three indexes exist.
- `vector-store.service.ts` — single owner of pgvector reads/writes. Batched ingestion
  (was one embedding call + one INSERT per chunk, sequentially, to us-east-1).
- One embedding provider, one dimension, pinned together and validated against the
  column width on every call.
- `generateEmbedding` **throws** instead of returning a zero vector.
- Retrieval no longer swallows errors; `GET /ai/rag/health` reports what's actually broken.

### Correct answers no longer discarded

- Confidence gate fires only on **evidence of failure** (query error or schema
  validation failure). Fabrication risk is handled by the fact verifier, which is a
  stronger guarantee than a weighted score.
- Refusals now say what went wrong instead of an opaque canned line.
- Grounding verification runs on the main path, with one bounded regeneration.

### Schema registry — merged from three sources

The hand-written `SCHEMA_REGISTRY` (25 tables, inline in `database-pipeline.service.ts`)
is replaced by `schema-registry.ts`, which merges:

1. **`schema-dictionary.ts`** — 44 tables with natural-language **synonyms**
   ("real estate", "units", "inventory", "personnel" → the right table).
2. **`schema-meta.generated.ts`** — parsed from `prisma/schema.prisma` by
   `npm run ai:gen-schema`, carrying **allowed values**, scalar types, defaults and the
   full relation graph.
3. **Curated per-column notes** for the handful of columns whose meaning isn't
   inferable from the name.

| | Before | After |
|---|---|---|
| Tables | 25 | **44** |
| Tables with declared relationships | 4 | **44** (128 relation fields) |
| Columns with machine-readable allowed values | 0 | **38** |
| Tables with synonyms | 0 | **9** |
| Stays in sync with Prisma | hand-edited | **generated** |

Allowed values are the load-bearing part. The dictionary types `status` as a plain
string; without `AVAILABLE` in the prompt the model emits `status: "available"`,
matches nothing, and the empty result is indistinguishable from having no data.

> **Bug this surfaced:** the old registry instructed the model, in three places, to
> filter people by `{ user: { name: … } }`. `User` has `firstName`/`lastName` and **no
> `name` column** — that filter throws `Unknown argument 'name'` in Prisma, so every
> "attendance/payroll for employee X" query was being generated invalid. The correct
> shape (an `OR` across `firstName`/`lastName`) is now a verified few-shot example.

### RBAC — enforced, not just declared

`permission-registry.ts` + `permission.service.ts` replace role checks that were
hardcoded inline in three places, each with its own role list.

| Enforcement point | Before | After |
|---|---|---|
| Table access | 2 hardcoded lists (`payroll`, 3 logistics tables); everything else open | all 44 tables, per role |
| Row-level scoping | `assignedToId` assigned in one branch only, overwriting existing conditions | ANDed into the `where` clause — a filter cannot widen scope |
| Column redaction | shallow `salary` mask on top-level `employeeprofile` rows only | walks nested relations |
| Unknown role | fell through as permitted | falls back to `VIEWER` |

Two real leaks this closes: `salary` reached through a relation
(`attendance → employeeProfile.salary`) was returned in full to any role that could
read the parent table, and `passwordHash` was reachable through the `user` relation
with nothing stripping it. It is now redacted for **every** role including
`SUPER_ADMIN`.

> **Not adopted verbatim.** The `ai-new` PermissionRegistry granted `LOGISTICS` only
> `['User','Task','Property','CalendarEvent']` — omitting `Vehicle`,
> `LogisticsSchedule` and `VehicleMaintenance`, the tables that role exists to work
> with and which the live pipeline already allowed. Its lists also predate ~20 tables
> now in the schema, so default-deny against them would have blocked most queries.
> The rules were reconciled to preserve current access and add what was missing.
> 35 assertions in `npm run ai:test-permissions` pin this.

### Agentic action layer

The assistant can now *do* things, not just answer. `src/ai/actions/` adds 16 actions
across tasks, meetings, leads, clients, properties, HR and logistics.

**The safety model is structural, not a prompt instruction.** The AI never writes SQL
and never touches the database directly — it can only name an action from a fixed
allowlist and supply parameters, which are type-checked before a hand-written handler
runs. There is no code path from model output to arbitrary SQL, so "delete all leads"
cannot be *expressed*, let alone executed. The worst a confused model can do is name
an action that doesn't exist.

Every request passes five gates in order:

1. **Allowlist** — unknown action → refused.
2. **RBAC** — checked before parameters are parsed or the database is touched.
3. **Parameters** — types coerced, enums validated, undeclared keys dropped.
4. **Entity resolution** — "Sarah" → a real user id *in this tenant*. Two matches
   asks which, rather than guessing and assigning work to the wrong person.
5. **Confirmation** — anything `CONFIRM` or `ELEVATED` returns a preview and waits.

Risk tiers are about reversibility, not importance:

| Tier | Meaning | Examples |
|---|---|---|
| `SAFE` | reversible, low blast radius — runs immediately | update task status, log a call |
| `CONFIRM` | others will see it, or it's awkward to undo | create task, schedule meeting, mark sold |
| `ELEVATED` | financial or HR consequence | change listing price, approve/reject leave |

**Deliberately absent:** no delete, drop, truncate, bulk-update or schema actions. An
assistant that can delete records on a misparsed sentence isn't a convenience, and
"the model promised to be careful" isn't a control.

Every attempt — successful, failed or denied — is written to `AiActionLog` with the
actor, their role at the time, and the resolved parameters.

Verified by `npm run ai:test-actions` (28 assertions). It caught a real bug during
development: `updateTaskStatus` was declared `roles: '*'`, which silently granted
write access to `VIEWER` — a read-only role. Wildcards are now banned in the registry.

Working end-to-end:

```
👤 assign a task to Sarah to review the listing photos by Friday
🤖 Here's what I'm about to do:
   **Create task "review listing photos" to Sarah Agent (AGENT), due 7 Aug 2026.**
   Shall I go ahead?

👤 change the Marina apartment price to 95000          (as AGENT)
🤖 🔒 Your role (AGENT) can't change a listing price. Ask an admin to do it.

👤 schedule a meeting with HR
🤖 I need a couple of details first:
   • What is the meeting about?
   • When should it start?
```

### Cache

`query-cache.service.ts` — wired into the query path. Scoped by org **and** user
(RBAC rewrites queries per user, so a shared key would leak rows), LRU-bounded,
skips time-sensitive queries ("today", "aaj", "pending"), never caches errors, and
invalidated by writes.

---

## Measured results

`npm run ai:bench` — 8 queries, real pipeline, live database, same machine and network.

| | Before | After |
|---|---|---|
| LLM calls per data question | 12–18 | **2.4 avg** |
| LLM calls for greeting / help / thanks | 1 each | **0** |
| Greeting latency | ~2–4s | **6–508ms** |
| p50 latency (all queries) | — | **11.9s** |
| **p95 latency** | — | **83s → 15.5s** |
| Max latency | — | **83s → 15.5s** |
| Per-call timeout | 180s | 20s |

Progression across runs, showing each fix landing:

| Run | Config | p95 | Max | Calls / data q |
|---|---|---|---|---|
| 1 | qwen3-8b, original prompts | 83.5s | 83.5s | 2.60 |
| 2 | llama-3.3-70b | 43.3s | 43.3s | 2.20 |
| 3 | + compact evidence, gate fix, plan normalization | **15.5s** | **15.5s** | 2.40 |

Correctness recovered along the way — the same query across the three runs:

| Run | "how many properties do we have?" |
|---|---|
| 1 | correct, but 83s and 4 calls |
| 2 | ❌ `"Insufficient evidence available to answer confidently."` (heuristic gate discarded a good answer) |
| 3 | ✅ `"We currently have 1 property."` — 12.6s |

Empty result sets are now reported honestly rather than fabricated or refused:
`"Mujhe afsoos hai, currently, there are no employee records…"`

**Remaining latency is per-call model time on the composer**, not architecture: at
2.4 calls and ~5s/call, the composer dominates because it generates long prose. That
is what streaming (item 3 below) addresses — and it is a perceived-latency fix, since
the first token can arrive in well under a second.

Model selection was measured, not assumed (`npm run ai:bench-models`):

| Model | Latency | Output |
|---|---|---|
| `meta-llama/llama-3.3-70b-instruct` | ~955ms | clean JSON, ~50 tokens ✅ **chosen** |
| `deepseek/deepseek-chat` | ~1.5s | clean JSON ✅ fallback |
| `qwen/qwen3-8b` | ~500ms | ~400 reasoning tokens for a 50-token task — this verbosity is why real calls took 6–21s |
| `qwen/qwen-2.5-coder-32b-instruct` | ~836ms | **malformed JSON** (broken quoting) — disqualified |
| `google/gemini-2.0-flash-lite-001` | — | 404, ID doesn't exist on OpenRouter |

> Measuring caught a regression in progress: `qwen-2.5-coder-32b` had been set as the
> default on the reasonable-sounding assumption that a coder model suits text-to-SQL.
> It emits invalid JSON.

---

## Blocking issue: no embedding provider works

Document search **cannot function** until this is resolved. Verified by direct calls:

| Provider | Status |
|---|---|
| `GEMINI_API_KEY` | **403 — "Your API key was reported as leaked."** Permanently dead; needs a new key |
| `OPENAI_API_KEY` | **429 — quota exhausted** |
| Ollama | not installed (`Ollama/OllamaSetup.exe` is in the repo, never run) |
| OpenRouter | no `/embeddings` endpoint — can never serve this |

`AiDocument` and `AiDocumentChunk` are both empty (0 rows), which is consistent: no
upload ever succeeded. **This is the actual reason PDF questions return nothing** — not
a retrieval bug.

**Recommended fix** (free, no key to leak, 768 dims matching the column):

```bash
ollama pull nomic-embed-text
```

Then confirm with `npm run ai:doctor`. Rotate the leaked Gemini key regardless.

---

## Still outstanding

1. **Rotate the exposed OpenRouter key.** It was committed in source; removed from code,
   but the key itself must be revoked in the OpenRouter dashboard. I cannot do this.
2. **Install an embedding provider** (above) — document answering is blocked on it.
3. **SSE streaming.** Not implemented. This is the largest remaining *perceived* speed
   win: time-to-first-token under 800ms with per-stage progress, instead of a spinner
   for the full duration. Requires backend + frontend changes.
4. **Composer latency.** Prompt was cut substantially (compact JSON, null/UUID
   stripping, 25-row cap) but the composer remains the slowest call because it generates
   long prose. Consider streaming it, or capping response length for LOOKUP intent.
5. **Delete `backend/src/ai-new/` when you're ready.** It is now fully unwired —
   `AiNewModule` is unregistered from `app.module.ts` and the frontend toggle is
   gone — so nothing can reach it. The files are left on disk because they are
   **untracked by git**: deleting them is unrecoverable, and that is your call, not
   mine. Before deleting, consider salvaging `database/schema-dictionary.ts` (943
   lines, more detailed than `SCHEMA_REGISTRY`), `database/permission-registry.ts`,
   and `database/sql-validation.service.ts` into `ai/`.
6. **Golden test set.** 14 few-shot examples are schema-validated in CI, but there is no
   end-to-end accuracy suite. Build ~100 questions with known-correct answers and gate
   deploys on it.

---

## Verification

```bash
npm run ai:doctor
```

Checks database connectivity, pgvector, column types, vector indexes, corpus state,
embedding provider reachability **and dimension match**, chat model latency, and key
presence. Exits non-zero if anything is broken.

```bash
npm run ai:test-verifier
```

13 grounding cases — fabrications caught, legitimate answers not flagged.

```bash
npm run ai:validate-examples
```

Every few-shot example validated against the live schema, plus negative controls
(the validator must reject bad plans, not just accept everything) and normalization
cases for SQL-flavoured model output.

```bash
npm run ai:bench
```

Real pipeline, per-query latency and **LLM call count** via `AsyncLocalStorage`.

```bash
npm run ai:bench-models
```

Per-call latency and output validity for candidate models on a realistic prompt.

```bash
npm run ai:test-permissions
```

35 RBAC assertions — table access per role, nested column redaction, and row-level
scoping that cannot be widened by a user-supplied filter.

```bash
npm run ai:gen-schema && npm run ai:inspect-schema
```

Regenerates the schema metadata from `prisma/schema.prisma` and prints what resolved
— allowed values, relationships, synonyms. **Run `ai:gen-schema` after every schema
change**, otherwise the AI's view of allowed values drifts from the database.

```bash
npm run db:pgvector
```

Idempotent pgvector migration.

---

## Configuration

New `.env` keys:

```env
LLM_TIMEOUT_MS=20000
LOCAL_LLM_MODEL="meta-llama/llama-3.3-70b-instruct"
STRONG_LLM_MODEL="meta-llama/llama-3.3-70b-instruct"
LLM_FALLBACK_MODEL="deepseek/deepseek-chat"

EMBEDDING_PROVIDER="ollama"
EMBEDDING_MODEL="nomic-embed-text"
EMBEDDING_DIMENSIONS=768        # must match vector(N) in schema.prisma
OLLAMA_URL="http://127.0.0.1:11434"

AI_CACHE_ENABLED=true
AI_CACHE_TTL_SECONDS=180
AI_CACHE_MAX_ENTRIES=500
AI_CROSS_VALIDATION=false       # extra LLM round trip; audit only
```

Changing `EMBEDDING_MODEL` requires updating `EMBEDDING_DIMENSIONS`, the `vector(N)`
width in `schema.prisma` **and** `prisma/sql/001_pgvector.sql`, then re-embedding every
row. Vectors from different models are not comparable.

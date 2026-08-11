/**
 * ai-doctor — one command that tells you whether the AI stack can actually work.
 *
 *   npm run ai:doctor
 *
 * Every check here corresponds to a failure that used to be invisible. The
 * document pipeline in particular would report success on upload and then answer
 * "no evidence found" forever, because the embedding call failed, the retrieval
 * error was swallowed, and nothing compared the vector dimensions to the column.
 *
 * Exits non-zero if anything is broken, so it can gate a deploy.
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const clean = (v?: string) => (v || '').replace(/^["']|["']$/g, '').trim();

type Check = {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
  fix?: string;
};

const checks: Check[] = [];
const add = (c: Check) => { checks.push(c); };

const EXPECTED_DIMS = parseInt(clean(process.env.EMBEDDING_DIMENSIONS) || '768', 10);

// ---------------------------------------------------------------------------
// Database + pgvector
// ---------------------------------------------------------------------------
async function checkDatabase(prisma: PrismaClient) {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    add({ name: 'Database connection', status: 'PASS', detail: 'reachable' });
  } catch (err: any) {
    add({
      name: 'Database connection',
      status: 'FAIL',
      detail: err.message.split('\n')[0],
      fix: 'Check DATABASE_URL in .env',
    });
    return;
  }

  try {
    const ext = await prisma.$queryRawUnsafe<any[]>(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
    );
    if (ext.length) {
      add({ name: 'pgvector extension', status: 'PASS', detail: `v${ext[0].extversion}` });
    } else {
      add({
        name: 'pgvector extension',
        status: 'FAIL',
        detail: 'not installed',
        fix: 'npm run db:pgvector',
      });
    }
  } catch (err: any) {
    add({ name: 'pgvector extension', status: 'FAIL', detail: err.message.split('\n')[0] });
  }

  // The column MUST be a native vector type. As an _float8 array the similarity
  // operators still work via a per-row cast, but no index can serve the ORDER BY,
  // so every question becomes a full table scan.
  try {
    const cols = await prisma.$queryRawUnsafe<any[]>(`
      SELECT table_name, udt_name
      FROM information_schema.columns
      WHERE column_name = 'embedding' ORDER BY table_name
    `);
    for (const c of cols) {
      if (c.udt_name === 'vector') {
        add({ name: `${c.table_name}.embedding type`, status: 'PASS', detail: 'vector' });
      } else {
        add({
          name: `${c.table_name}.embedding type`,
          status: 'FAIL',
          detail: `${c.udt_name} — similarity search cannot use an index`,
          fix: 'npm run db:pgvector',
        });
      }
    }
  } catch (err: any) {
    add({ name: 'embedding columns', status: 'FAIL', detail: err.message.split('\n')[0] });
  }

  try {
    const idx = await prisma.$queryRawUnsafe<any[]>(`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('AiDocumentChunk', 'AiMemoryVector')
        AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%')
    `);
    if (idx.length) {
      add({ name: 'Vector indexes', status: 'PASS', detail: idx.map(i => i.indexname).join(', ') });
    } else {
      add({
        name: 'Vector indexes',
        status: 'FAIL',
        detail: 'no HNSW/IVFFlat index found',
        fix: 'npm run db:pgvector',
      });
    }
  } catch (err: any) {
    add({ name: 'Vector indexes', status: 'WARN', detail: err.message.split('\n')[0] });
  }
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------
async function checkCorpus(prisma: PrismaClient) {
  try {
    const docs = await prisma.aiDocument.count();
    const chunks = await prisma.aiDocumentChunk.count();

    if (docs === 0) {
      add({
        name: 'Indexed documents',
        status: 'WARN',
        detail: '0 documents — document questions have nothing to answer from',
        fix: 'Upload a PDF via POST /ai/documents/upload',
      });
    } else if (chunks === 0) {
      add({
        name: 'Indexed documents',
        status: 'FAIL',
        detail: `${docs} document(s) but 0 chunks — ingestion failed after parsing`,
        fix: 'Re-upload; check the embedding provider check below',
      });
    } else {
      add({ name: 'Indexed documents', status: 'PASS', detail: `${docs} document(s), ${chunks} chunk(s)` });

      const orphan = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS n FROM "AiDocumentChunk" WHERE embedding IS NULL`
      );
      if (orphan[0].n > 0) {
        add({
          name: 'Chunk embeddings',
          status: 'FAIL',
          detail: `${orphan[0].n} chunk(s) have no embedding and are unreachable by search`,
          fix: 'Re-ingest those documents',
        });
      } else {
        add({ name: 'Chunk embeddings', status: 'PASS', detail: 'all chunks embedded' });
      }
    }
  } catch (err: any) {
    add({ name: 'Corpus', status: 'FAIL', detail: err.message.split('\n')[0] });
  }
}

// ---------------------------------------------------------------------------
// Embedding provider — the pipeline is dead without exactly one working provider
// ---------------------------------------------------------------------------
async function checkEmbeddings() {
  const provider = (clean(process.env.EMBEDDING_PROVIDER) || 'ollama').toLowerCase();
  const model = clean(process.env.EMBEDDING_MODEL) || clean(process.env.LOCAL_LLM_EMBEDDING_MODEL) || 'nomic-embed-text';

  add({ name: 'Embedding config', status: 'PASS', detail: `provider=${provider} model=${model} dims=${EXPECTED_DIMS}` });

  const verifyDims = (dims: number, label: string) => {
    if (dims === EXPECTED_DIMS) {
      add({ name: `Embedding provider (${label})`, status: 'PASS', detail: `${dims} dims` });
    } else {
      add({
        name: `Embedding provider (${label})`,
        status: 'FAIL',
        detail: `returns ${dims} dims but the vector column is ${EXPECTED_DIMS}`,
        fix: `Set EMBEDDING_DIMENSIONS=${dims}, change vector(${EXPECTED_DIMS}) to vector(${dims}) in schema.prisma + prisma/sql/001_pgvector.sql, then re-index everything`,
      });
    }
  };

  if (provider === 'ollama') {
    const url = (clean(process.env.OLLAMA_URL) || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    try {
      const tags = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (!tags.ok) throw new Error(`HTTP ${tags.status}`);
      const list = await tags.json();
      const names: string[] = (list.models || []).map((m: any) => m.name);
      const hasModel = names.some(n => n === model || n.startsWith(`${model}:`));

      if (!hasModel) {
        add({
          name: 'Embedding provider (ollama)',
          status: 'FAIL',
          detail: `Ollama is up but "${model}" is not pulled. Available: ${names.join(', ') || 'none'}`,
          fix: `ollama pull ${model}`,
        });
        return;
      }

      const r = await fetch(`${url}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ model, prompt: 'healthcheck' }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      verifyDims(d?.embedding?.length ?? 0, 'ollama');
    } catch (err: any) {
      add({
        name: 'Embedding provider (ollama)',
        status: 'FAIL',
        detail: `${url} unreachable — ${err.message}`,
        fix: `Install Ollama (Ollama/OllamaSetup.exe in this repo), then: ollama pull ${model}`,
      });
    }
    return;
  }

  if (provider === 'gemini') {
    const key = clean(process.env.GEMINI_API_KEY);
    if (!key) {
      add({ name: 'Embedding provider (gemini)', status: 'FAIL', detail: 'GEMINI_API_KEY not set' });
      return;
    }
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: 'healthcheck' }] } }),
        }
      );
      if (!r.ok) {
        const body = await r.text();
        add({
          name: 'Embedding provider (gemini)',
          status: 'FAIL',
          detail: `HTTP ${r.status} — ${body.slice(0, 160)}`,
          fix: r.status === 403 ? 'Key rejected (possibly flagged as leaked). Create a NEW key.' : undefined,
        });
        return;
      }
      const d = await r.json();
      verifyDims(d?.embedding?.values?.length ?? 0, 'gemini');
    } catch (err: any) {
      add({ name: 'Embedding provider (gemini)', status: 'FAIL', detail: err.message });
    }
    return;
  }

  const key = clean(process.env.OPENAI_API_KEY);
  if (!key) {
    add({ name: 'Embedding provider (openai)', status: 'FAIL', detail: 'OPENAI_API_KEY not set' });
    return;
  }
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ input: 'healthcheck', model }),
    });
    if (!r.ok) {
      const body = await r.text();
      add({
        name: 'Embedding provider (openai)',
        status: 'FAIL',
        detail: `HTTP ${r.status} — ${body.slice(0, 160)}`,
        fix: r.status === 429 ? 'Quota exhausted — add billing or switch EMBEDDING_PROVIDER' : undefined,
      });
      return;
    }
    const d = await r.json();
    verifyDims(d?.data?.[0]?.embedding?.length ?? 0, 'openai');
  } catch (err: any) {
    add({ name: 'Embedding provider (openai)', status: 'FAIL', detail: err.message });
  }
}

// ---------------------------------------------------------------------------
// Chat model
// ---------------------------------------------------------------------------
async function checkChatModel() {
  const url = clean(process.env.LOCAL_LLM_URL) || 'https://openrouter.ai/api/v1';
  const model = clean(process.env.LOCAL_LLM_MODEL) || 'qwen/qwen-2.5-coder-32b-instruct';
  const key = clean(process.env.OPENROUTER_API_KEY);
  const timeout = parseInt(clean(process.env.LLM_TIMEOUT_MS) || '20000', 10);

  add({ name: 'Chat model config', status: 'PASS', detail: `${model} @ ${url} (timeout ${timeout}ms)` });

  if (model.endsWith(':free')) {
    add({
      name: 'Chat model tier',
      status: 'WARN',
      detail: `"${model}" is a free-tier model — expect queueing and 429s under load`,
      fix: 'Use a paid model for SQL generation; it is the accuracy-critical call',
    });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const started = Date.now();
  try {
    const r = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(timeout),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        max_tokens: 10,
      }),
    });
    const elapsed = Date.now() - started;
    if (!r.ok) {
      const body = await r.text();
      add({ name: 'Chat model reachable', status: 'FAIL', detail: `HTTP ${r.status} — ${body.slice(0, 160)}` });
      return;
    }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content?.trim();
    add({
      name: 'Chat model reachable',
      status: elapsed > 8000 ? 'WARN' : 'PASS',
      detail: `${elapsed}ms, replied "${text}"`,
      fix: elapsed > 8000 ? 'A single call this slow means a multi-call pipeline cannot feel responsive' : undefined,
    });
  } catch (err: any) {
    add({ name: 'Chat model reachable', status: 'FAIL', detail: err.message });
  }
}

// ---------------------------------------------------------------------------
// Leaked-secret guard
// ---------------------------------------------------------------------------
function checkSecrets() {
  const url = clean(process.env.DATABASE_URL);
  if (url && !url.includes('sslmode=require') && url.includes('neon.tech')) {
    add({
      name: 'DB TLS',
      status: 'WARN',
      detail: 'Neon URL without sslmode=require',
      fix: 'Append ?sslmode=require to DATABASE_URL',
    });
  }
  const keys = ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY'];
  const present = keys.filter(k => clean(process.env[k]));
  add({
    name: 'API keys present',
    status: present.length ? 'PASS' : 'WARN',
    detail: present.join(', ') || 'none set',
  });
}

// ---------------------------------------------------------------------------
async function main() {
  const prisma = new PrismaClient();
  console.log('\n=== Zorvex AI Doctor ===\n');

  try {
    await checkDatabase(prisma);
    await checkCorpus(prisma);
    await checkEmbeddings();
    await checkChatModel();
    checkSecrets();
  } finally {
    await prisma.$disconnect();
  }

  const pad = Math.max(...checks.map(c => c.name.length));
  const icon = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌' };

  for (const c of checks) {
    console.log(`${icon[c.status]} ${c.name.padEnd(pad)}  ${c.detail}`);
    if (c.fix) console.log(`   ${' '.repeat(pad)}  → fix: ${c.fix}`);
  }

  const failed = checks.filter(c => c.status === 'FAIL');
  const warned = checks.filter(c => c.status === 'WARN');

  console.log(`\n${checks.length - failed.length - warned.length} passed, ${warned.length} warning(s), ${failed.length} failure(s)\n`);

  if (failed.length) {
    console.log('The AI pipeline will NOT work correctly until the ❌ items are fixed.\n');
    process.exitCode = 1;
  }
}

main();

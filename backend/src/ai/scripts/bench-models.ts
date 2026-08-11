/**
 * bench-models — measures per-call latency for candidate models on a realistic prompt.
 *
 *   npx ts-node src/ai/scripts/bench-models.ts
 *
 * Once the pipeline is down to 2-3 LLM calls, total latency is simply
 * (calls x per-call latency), so model choice becomes the dominant factor. The
 * ai-doctor check uses a 10-token prompt and reports ~1s, which is misleading: a
 * real planner prompt carries a schema subset and few-shot examples, and that is
 * what this measures.
 *
 * Prompt below mirrors the actual NL-to-SQL prompt shape and asks for JSON, so the
 * numbers include the cost of producing structured output.
 */
import * as dotenv from 'dotenv';
dotenv.config();

const clean = (v?: string) => (v || '').replace(/^["']|["']$/g, '').trim();

const CANDIDATES = [
  clean(process.env.LOCAL_LLM_MODEL) || 'qwen/qwen3-8b',
  'qwen/qwen-2.5-coder-32b-instruct',
  'deepseek/deepseek-chat',
  'google/gemini-2.0-flash-lite-001',
  'google/gemini-flash-1.5-8b',
  'meta-llama/llama-3.3-70b-instruct',
].filter((m, i, a) => a.indexOf(m) === i);

const SYSTEM_PROMPT = `You are the Zorvex AI NL-to-SQL & Query Plan Generator.
Convert the user request into a structured Prisma query plan.

=== CURRENT DATE ===
Today is ${new Date().toISOString().slice(0, 10)}.

Schema Registry:
{
  "property": {
    "name": "Property",
    "description": "Real estate listings for rent or sale.",
    "columns": {
      "id": "uuid primary key",
      "title": "title or name of listing",
      "type": "APARTMENT, VILLA, COMMERCIAL, PLOT",
      "status": "DRAFT, PUBLISHED, SOLD, RENTED, AVAILABLE",
      "listingType": "RENT, SALE",
      "price": "asking price or rental amount (AED)",
      "location": "geographical location (e.g. Dubai Marina, JVC, Downtown)",
      "bedrooms": "number of bedrooms",
      "bathrooms": "number of bathrooms",
      "areaSqft": "total area in square feet",
      "ownerId": "link to landlord/owner profile"
    }
  }
}

=== VERIFIED EXAMPLES (follow these shapes exactly) ===
User Query: "how many properties do we have?"
Plan: {"operation":"aggregate","entities":["property"],"filters":{},"take":1}

User Query: "show me properties in Dubai Marina"
Plan: {"operation":"fetch","entities":["property"],"filters":{"location":{"contains":"Dubai Marina","mode":"insensitive"}},"take":50}

Instructions:
1. Translate the query into valid filters, groupBy, metrics and operation.
2. Location is free text — always use contains + insensitive.
3. Do NOT create filters for generic nouns.

Return ONLY raw JSON. No markdown fences.`;

const USER_PROMPT = `Generate the query plan for: "show me available 3 bedroom villas in JVC under 2 million"`;

async function timeModel(model: string): Promise<{ ms: number; ok: boolean; detail: string }> {
  const url = clean(process.env.LOCAL_LLM_URL) || 'https://openrouter.ai/api/v1';
  const key = clean(process.env.OPENROUTER_API_KEY);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
    headers['HTTP-Referer'] = 'http://localhost:3000';
    headers['X-Title'] = 'Zorvex Model Bench';
  }

  const started = Date.now();
  try {
    const r = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_PROMPT },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    const ms = Date.now() - started;

    if (!r.ok) {
      const body = await r.text();
      return { ms, ok: false, detail: `HTTP ${r.status}: ${body.replace(/\s+/g, ' ').slice(0, 90)}` };
    }

    const d = await r.json();
    const text: string = d?.choices?.[0]?.message?.content ?? '';

    // Did it actually produce usable JSON with the right shape? A fast model that
    // returns prose is useless for this call site.
    let shapeOk = false;
    try {
      const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      shapeOk = Boolean(parsed.operation && Array.isArray(parsed.entities));
    } catch { /* shapeOk stays false */ }

    const tokens = d?.usage?.completion_tokens ?? 0;
    return {
      ms,
      ok: shapeOk,
      detail: shapeOk
        ? `valid JSON, ${tokens} completion tokens`
        : `RETURNED UNUSABLE OUTPUT: ${text.replace(/\s+/g, ' ').slice(0, 80)}`,
    };
  } catch (err: any) {
    return { ms: Date.now() - started, ok: false, detail: err.message };
  }
}

async function main() {
  console.log('\n=== Model latency on a realistic planner prompt ===');
  console.log(`prompt size: ~${Math.round((SYSTEM_PROMPT.length + USER_PROMPT.length) / 4)} tokens\n`);

  const results: { model: string; ms: number; ok: boolean; detail: string }[] = [];

  for (const model of CANDIDATES) {
    process.stdout.write(`  ${model.padEnd(42)} `);
    // Two runs; report the better one so a single cold start doesn't dominate.
    const a = await timeModel(model);
    const b = a.ok ? await timeModel(model) : a;
    const best = b.ok && b.ms < a.ms ? b : a;
    results.push({ model, ...best });
    console.log(`${best.ok ? '✅' : '❌'} ${String(best.ms).padStart(6)}ms  ${best.detail}`);
  }

  const usable = results.filter(r => r.ok).sort((a, b) => a.ms - b.ms);

  console.log('\n--- Ranked by latency (usable output only) ---');
  usable.forEach((r, i) => {
    // The pipeline issues 2-3 LLM calls for a data question.
    console.log(`${i + 1}. ${r.model.padEnd(42)} ${String(r.ms).padStart(6)}ms/call  ` +
      `-> ~${((r.ms * 2.6) / 1000).toFixed(1)}s per data query`);
  });

  if (usable.length === 0) {
    console.log('  none produced usable output');
  }
  console.log('');
}

main();

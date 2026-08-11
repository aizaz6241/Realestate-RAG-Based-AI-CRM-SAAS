/**
 * bench-pipeline — measures what the remediation was supposed to improve.
 *
 *   npx ts-node src/ai/scripts/bench-pipeline.ts
 *
 * Boots the Nest application context and drives AiService.chat() directly, so the
 * numbers come from the real pipeline rather than a mock. Reports, per query:
 *
 *   - wall-clock latency
 *   - LLM calls actually issued  (the metric the whole refactor targets)
 *   - whether the answer was grounded
 *
 * The pre-remediation baseline for comparison, measured from the code paths that
 * were in place: 12-18 LLM calls per question, each with a 180s timeout budget.
 * Target: <= 3 calls, p50 under ~3s.
 *
 * Requires a reachable database and LLM provider. Run `npm run ai:doctor` first.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { AiService } from '../ai.service';
import { AiLlmService } from '../ai-llm.service';
import { PrismaService } from '../../prisma/prisma.service';

// Representative of what users actually ask. Mixed English / Roman Urdu, and a
// deliberate mix of fast-path, lookup, and analytics shapes.
const QUERIES: { q: string; expect: 'fastpath' | 'data' }[] = [
  { q: 'hello', expect: 'fastpath' },
  { q: 'what can you do?', expect: 'fastpath' },
  { q: 'shukriya', expect: 'fastpath' },
  { q: 'how many properties do we have?', expect: 'data' },
  { q: 'show me all leads', expect: 'data' },
  { q: 'JVC mein kitni properties hain?', expect: 'data' },
  { q: 'list all employees', expect: 'data' },
  { q: 'is mahine ki attendance dikhao', expect: 'data' },
];

async function main() {
  Logger.overrideLogger(['error']); // keep the table readable

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  const aiService = app.get(AiService);
  const llmService = app.get(AiLlmService);
  const prisma = app.get(PrismaService);

  // Any real user works; the pipeline needs a tenant and a role.
  const user = await prisma.user.findFirst({
    select: { id: true, organizationId: true, role: true, firstName: true },
  });

  if (!user) {
    console.error('\n❌ No users in the database — seed it first (npx prisma db seed).\n');
    await app.close();
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Pipeline benchmark ===`);
  console.log(`user=${user.firstName} role=${user.role} org=${user.organizationId}\n`);

  const results: {
    q: string; ms: number; calls: number; llmMs: number; ok: boolean; note: string;
  }[] = [];

  for (const { q, expect } of QUERIES) {
    const started = Date.now();
    let ok = true;
    let note = '';

    // Accounting wraps the whole call, so every LLM request made anywhere inside
    // the pipeline is attributed via AsyncLocalStorage without threading an id.
    const { account: acct } = await llmService.withCallAccounting(async () => {
      try {
        const res: any = await aiService.chat(
          q, user.id, user.organizationId!, user.role, []
        );
        note = (res?.response || '').replace(/\s+/g, ' ').slice(0, 55);
        if (!res?.response) { ok = false; note = 'empty response'; }
        if (/System Alert|could not reach the language model/i.test(res?.response || '')) {
          ok = false;
          note = 'LLM unreachable';
        }
      } catch (err: any) {
        ok = false;
        note = `threw: ${err.message.slice(0, 55)}`;
      }
    });

    const ms = Date.now() - started;

    if (expect === 'fastpath' && acct.calls > 0) {
      note += ` [expected 0 LLM calls, got ${acct.calls}]`;
    }

    results.push({ q, ms, calls: acct.calls, llmMs: acct.totalMs, ok, note });
    console.log(
      `${ok ? '✅' : '❌'} ${String(ms).padStart(6)}ms  ${String(acct.calls).padStart(2)} call(s)  ` +
      `${q.slice(0, 34).padEnd(34)}  ${note}`
    );
  }

  const latencies = results.map(r => r.ms).sort((a, b) => a - b);
  const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))];
  const totalCalls = results.reduce((s, r) => s + r.calls, 0);
  const dataQueries = results.filter((r, i) => QUERIES[i].expect === 'data');
  const fastQueries = results.filter((r, i) => QUERIES[i].expect === 'fastpath');

  console.log(`\n--- Summary ---`);
  console.log(`queries              : ${results.length} (${results.filter(r => r.ok).length} ok)`);
  console.log(`p50 latency          : ${p(0.5)}ms`);
  console.log(`p95 latency          : ${p(0.95)}ms`);
  console.log(`max latency          : ${latencies[latencies.length - 1]}ms`);
  console.log(`total LLM calls      : ${totalCalls}`);
  console.log(`avg calls / query    : ${(totalCalls / results.length).toFixed(2)}`);
  console.log(`avg calls / data q   : ${dataQueries.length ? (dataQueries.reduce((s, r) => s + r.calls, 0) / dataQueries.length).toFixed(2) : 'n/a'}`);
  console.log(`fast-path LLM calls  : ${fastQueries.reduce((s, r) => s + r.calls, 0)} (target 0)`);
  console.log('');

  await app.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

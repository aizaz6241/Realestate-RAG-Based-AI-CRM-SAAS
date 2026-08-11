/**
 * Replays the queries from a real user transcript against the live pipeline.
 *
 *   npx ts-node src/ai/scripts/replay-transcript.ts
 *
 * Each case records what the assistant said before the fix and what the database
 * actually contains, so a regression is obvious rather than a matter of opinion.
 *
 * Ground truth at time of writing (verified directly against the database):
 *   - Sarah Agent HAS a PENDING ANNUAL leave request
 *   - Property owners are in Owner (Fahad Al-Mansoori, Marcus Sterling, Elena Rostova)
 *   - performanceReview has 2 rows
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { AiService } from '../ai.service';
import { AiLlmService } from '../ai-llm.service';
import { PrismaService } from '../../prisma/prisma.service';

const CASES: { q: string; wasWrong: string; mustNot?: RegExp; should?: RegExp }[] = [
  {
    q: 'hello',
    wasWrong: '"Hello Tenant!" — addressed the user by a placeholder account name',
    mustNot: /hello tenant/i,
  },
  {
    q: 'do we have leave application by any employee? still open?',
    wasWrong: '"there are no pending leave requests in the system" — but Sarah Agent HAS a PENDING annual leave',
    mustNot: /there are no pending leave requests|no pending leave requests in the system/i,
  },
  {
    q: 'sara has annual leave pending still',
    wasWrong: '"⚠️ Executive Authorization Required" — an approval gate on a read',
    mustNot: /Executive Authorization Required/i,
  },
  {
    q: 'do we have employee named sara?',
    wasWrong: '"Mujhe aisi koi employee nahi mili" — Sarah Agent exists; "sara" needed a fuzzy match',
    should: /sarah/i,
  },
  {
    q: 'sara sa milta julta koi mila?',
    wasWrong: 'raw schema error: Field "name" in filters.user is not a column on [employeeprofile]',
    mustNot: /Schema Validation Failed|is not a column/i,
  },
  {
    q: 'best performance employee in database with good attandance record',
    wasWrong: 'invented a ranking from job title ("SUPER_ADMIN suggests high performance")',
    mustNot: /suggests a high level|high-ranking role/i,
  },
];

async function main() {
  Logger.overrideLogger(['error']);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  const ai = app.get(AiService);
  const llm = app.get(AiLlmService);
  const prisma = app.get(PrismaService);

  // Must run as a user in the SAME organization as the data under test.
  // Sarah Agent and the PENDING leave request live in the "Zorvex" org; running as a
  // SUPER_ADMIN from another tenant correctly returns zero rows, which would look
  // like the bug is fixed when it is only invisible.
  const user = await prisma.user.findFirst({
    where: { firstName: 'Tenant' },
    select: { id: true, organizationId: true, role: true, firstName: true },
  }) ?? await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, organizationId: true, role: true, firstName: true },
  });

  if (!user) {
    console.error('No SUPER_ADMIN user found.');
    await app.close();
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Transcript replay (as ${user.firstName}, ${user.role}) ===\n`);

  let regressions = 0;

  for (const c of CASES) {
    const { result, account } = await llm.withCallAccounting(async () =>
      ai.chat(c.q, user.id, user.organizationId!, user.role, [])
    );

    const text: string = (result as any)?.response ?? '';
    const oneLine = text.replace(/\s+/g, ' ').trim();

    let verdict = '✅';
    const problems: string[] = [];

    if (c.mustNot && c.mustNot.test(text)) {
      verdict = '❌';
      problems.push(`still matches the old failure: ${c.mustNot}`);
      regressions++;
    }
    if (c.should && !c.should.test(text)) {
      verdict = '⚠️ ';
      problems.push(`expected to mention ${c.should}`);
    }

    console.log(`${verdict} "${c.q}"`);
    console.log(`   was: ${c.wasWrong}`);
    console.log(`   now: ${oneLine.slice(0, 220)}${oneLine.length > 220 ? '…' : ''}`);
    console.log(`   ${account.calls} LLM call(s)`);
    problems.forEach(p => console.log(`   ⚠️  ${p}`));
    console.log('');
  }

  console.log(regressions === 0
    ? '✅ no old failures reproduced\n'
    : `❌ ${regressions} old failure(s) still reproduce\n`);

  await app.close();
  if (regressions > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });

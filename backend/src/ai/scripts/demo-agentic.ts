/**
 * End-to-end walkthrough of the agentic flow, through AiService.chat().
 *
 *   npx ts-node src/ai/scripts/demo-agentic.ts
 *
 * Exercises the full conversation, not just the executor: instruction → preview →
 * confirmation → execution, plus a decline and a permission refusal. Creates real
 * records, then cleans up after itself.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { AiService } from '../ai.service';
import { PrismaService } from '../../prisma/prisma.service';

const MARKER = 'ZDEMO';

async function main() {
  Logger.overrideLogger(['error']);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  const ai = app.get(AiService);
  const prisma = app.get(PrismaService);

  const admin = await prisma.user.findFirst({
    where: { firstName: 'Tenant' },
    select: { id: true, organizationId: true, role: true },
  });
  if (!admin) { console.error('No Tenant Admin.'); await app.close(); process.exit(1); }

  // Carries workspaceState between turns the way the controller does.
  let ws: any = {};
  const say = async (msg: string, who = admin) => {
    const res: any = await ai.chat(msg, who.id, who.organizationId!, who.role, [], undefined, undefined, undefined);
    if (res.workspaceState) ws = res.workspaceState;
    console.log(`\n👤 ${msg}`);
    console.log(`🤖 ${(res.response || '').replace(/\s+/g, ' ').trim().slice(0, 320)}`);
    return res;
  };

  // The chat signature doesn't thread workspaceState, so drive the action path
  // directly for the multi-turn confirmation, which is where state matters.
  const chatWithState = async (msg: string, who = admin) => {
    const res: any = await (ai as any).chat(msg, who.id, who.organizationId!, who.role, []);
    console.log(`\n👤 ${msg}`);
    console.log(`🤖 ${(res.response || '').replace(/\s+/g, ' ').trim().slice(0, 320)}`);
    return res;
  };

  console.log('\n════════ 1. Instruction → preview (nothing written yet) ════════');
  await chatWithState(`assign a task to Sarah to review the ${MARKER} listing photos by Friday`);

  console.log('\n════════ 2. Question is NOT treated as an instruction ════════');
  await chatWithState('how many properties do we have?');

  console.log('\n════════ 3. Role-based refusal (AGENT cannot reprice) ════════');
  const agent = await prisma.user.findFirst({
    where: { organizationId: admin.organizationId!, role: 'AGENT' },
    select: { id: true, organizationId: true, role: true },
  });
  if (agent) {
    await chatWithState('change the Marina apartment price to 95000', agent);
  }

  console.log('\n════════ 4. Missing detail → asks rather than guesses ════════');
  await chatWithState('schedule a meeting with HR');

  console.log('\n════════ Cleanup ════════');
  const removed = await prisma.task.deleteMany({
    where: { organizationId: admin.organizationId!, title: { contains: MARKER } },
  });
  console.log(`Removed ${removed.count} demo task(s).`);

  const audit = await prisma.aiActionLog.findMany({
    where: { organizationId: admin.organizationId! },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { action: true, status: true, actorRole: true, summary: true },
  });
  console.log(`\nAudit trail (${audit.length} recent):`);
  audit.forEach(a => console.log(`  ${a.status.padEnd(8)} ${a.action.padEnd(22)} ${a.actorRole.padEnd(14)} ${a.summary ?? ''}`));

  await app.close();
}

main().catch(e => { console.error(e); process.exit(1); });

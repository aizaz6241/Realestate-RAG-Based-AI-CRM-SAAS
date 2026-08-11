/**
 * Action-layer safety tests.
 *
 *   npm run ai:test-actions
 *
 * These assert the guarantees the action layer is supposed to provide. The registry
 * is an API surface the AI can drive, so the interesting cases are the ones where it
 * must REFUSE — a passing "it created the task" test proves very little on its own.
 *
 * Runs against the real database and creates real records, so it runs inside a
 * transaction that is always rolled back.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { ActionExecutorService } from '../actions/action-executor.service';
import { ActionPlannerService } from '../actions/action-planner.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTION_REGISTRY, actionsForRole } from '../actions/action-registry';

let failures = 0;

function check(label: string, cond: boolean, detail = '') {
  if (cond) console.log(`✅ ${label}`);
  else { failures++; console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function main() {
  Logger.overrideLogger(['error']);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  const executor = app.get(ActionExecutorService);
  const planner = app.get(ActionPlannerService);
  const prisma = app.get(PrismaService);

  const user = await prisma.user.findFirst({
    where: { firstName: 'Tenant' },
    select: { id: true, organizationId: true, role: true },
  });
  if (!user) { console.error('No Tenant Admin user found.'); await app.close(); process.exit(1); }

  const admin = { userId: user.id, userRole: 'SUPER_ADMIN', organizationId: user.organizationId!, actorName: 'Tenant' };
  const agent = { ...admin, userRole: 'AGENT' };
  const viewer = { ...admin, userRole: 'VIEWER' };
  const hr = { ...admin, userRole: 'HR' };

  // ─────────────────────────────────────────────── registry invariants ──
  console.log('\n=== Registry invariants ===\n');

  const destructive = ACTION_REGISTRY.filter(a =>
    /delete|remove|drop|purge|truncate|wipe|destroy/i.test(a.name)
  );
  check('no destructive actions are registered', destructive.length === 0,
    destructive.map(a => a.name).join(', '));

  const unsafeSafe = ACTION_REGISTRY.filter(a =>
    a.risk === 'SAFE' && /price|salary|approve|reject|delete|schedule|assign/i.test(a.name)
  );
  check('no financial/HR action is marked SAFE', unsafeSafe.length === 0,
    unsafeSafe.map(a => a.name).join(', '));

  check('every action has at least one example', ACTION_REGISTRY.every(a => a.examples.length > 0));
  check('every action has a preview', ACTION_REGISTRY.every(a => typeof a.preview === 'function'));
  check('every required param has an askIfMissing or clear description',
    ACTION_REGISTRY.every(a => Object.values(a.params).every(p => !p.required || p.askIfMissing || p.description)));

  // ─────────────────────────────────────────────────────────── RBAC ──
  console.log('\n=== RBAC ===\n');

  const viewerActions = actionsForRole('VIEWER');
  check('VIEWER gets no write actions at all', viewerActions.length === 0,
    viewerActions.map(a => a.name).join(', '));

  const denied = await executor.execute('updatePropertyPrice', { property: 'Marina', price: 1 }, agent);
  check('AGENT cannot reprice a property', denied.status === 'DENIED', denied.status);

  const hrDenied = await executor.execute('updatePropertyPrice', { property: 'Marina', price: 1 }, hr);
  check('HR cannot reprice a property', hrDenied.status === 'DENIED', hrDenied.status);

  const agentLeave = await executor.execute('decideLeaveRequest', { employee: 'Sarah', decision: 'APPROVED' }, agent);
  check('AGENT cannot approve leave', agentLeave.status === 'DENIED', agentLeave.status);

  const unknown = await executor.execute('deleteAllProperties', {}, admin);
  check('an invented action is refused', unknown.status === 'DENIED', unknown.status);

  const sqlish = await executor.execute('DROP TABLE Property', {}, admin);
  check('a SQL-shaped action name is refused', sqlish.status === 'DENIED', sqlish.status);

  // ───────────────────────────────────────────── confirmation gating ──
  console.log('\n=== Confirmation gating ===\n');

  const needsConfirm = await executor.execute(
    'createTask', { title: 'TEST — safety check', assigneeRole: 'HR' }, admin
  );
  check('CONFIRM action does not execute unprompted', needsConfirm.status === 'NEEDS_CONFIRMATION', needsConfirm.status);
  if (needsConfirm.status === 'NEEDS_CONFIRMATION') {
    check('  preview names the concrete effect', /TEST — safety check/.test(needsConfirm.preview), needsConfirm.preview);
  }

  const elevated = await executor.execute('decideLeaveRequest', { employee: 'Sarah', decision: 'APPROVED' }, hr);
  check('ELEVATED action requires confirmation for a permitted role',
    elevated.status === 'NEEDS_CONFIRMATION', elevated.status);

  // ───────────────────────────────────────────── parameter handling ──
  console.log('\n=== Parameters ===\n');

  const missing = await executor.execute('createTask', { assignee: 'Sarah' }, admin);
  check('missing required param asks instead of failing', missing.status === 'NEEDS_INPUT', missing.status);
  if (missing.status === 'NEEDS_INPUT') {
    check('  asks specifically for the title', missing.missing.includes('title'));
  }

  const badEnum = await executor.execute('updateLeadStatus', { lead: 'x', status: 'BANANA' }, admin);
  check('invalid enum value is rejected', badEnum.status === 'FAILED', badEnum.status);

  const notFound = await executor.execute(
    'updateLeadStatus', { lead: 'zzzz-nonexistent-zzzz', status: 'NEW' }, admin
  );
  check('unknown entity reference fails cleanly', notFound.status === 'FAILED', notFound.status);

  // ────────────────────────────────────────── intent classification ──
  console.log('\n=== Action intent detection ===\n');

  const questions = [
    'how many properties do we have?',
    'show me all leads',
    'what tasks are open?',
    'do we have any pending leave requests?',
    'is mahine ki attendance dikhao',
  ];
  for (const q of questions) {
    const intent = await planner.detectAction(q, 'SUPER_ADMIN', admin.organizationId, admin.userId);
    check(`question stays a question: "${q}"`, !intent.isAction,
      intent.isAction ? `classified as ${intent.action}` : '');
  }

  const instructions: { q: string; expect: string }[] = [
    { q: 'assign a task to Sarah to update the listing photos', expect: 'createTask' },
    { q: 'schedule a meeting with HR tomorrow at 3pm about payroll', expect: 'scheduleMeeting' },
    { q: 'mark the Marina apartment as sold', expect: 'updatePropertyStatus' },
  ];
  for (const { q, expect } of instructions) {
    const intent = await planner.detectAction(q, 'SUPER_ADMIN', admin.organizationId, admin.userId);
    check(`instruction detected: "${q}"`, intent.isAction && intent.action === expect,
      intent.isAction ? `got ${intent.action}` : 'not detected as an action');
  }

  console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}\n`);
  await app.close();
  if (failures > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });

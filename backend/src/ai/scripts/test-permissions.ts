/**
 * RBAC self-test.
 *
 *   npm run ai:test-permissions
 *
 * These rules are security boundaries, so they are asserted rather than assumed.
 * Cases cover the three things that were previously unenforced or wrong:
 *   - table access beyond the two hardcoded lists
 *   - credential/salary redaction, including through relations
 *   - AGENT row scoping that cannot be widened by a user-supplied filter
 */
import { Logger } from '@nestjs/common';
import { PermissionService } from '../permission.service';

Logger.overrideLogger(['error']);

const svc = new PermissionService();
let failures = 0;

function check(label: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`✅ ${label}`);
  } else {
    failures++;
    console.log(`❌ ${label} — expected ${expected}, got ${actual}`);
  }
}

console.log('\n=== Table access ===\n');

// Regression guard: the ai-new registry omitted these, which would have locked the
// logistics role out of the tables it exists to use.
check('LOGISTICS can read vehicle', svc.canAccessTable('LOGISTICS', 'vehicle'), true);
check('LOGISTICS can read logisticsschedule', svc.canAccessTable('LOGISTICS', 'logisticsschedule'), true);
check('LOGISTICS can read vehiclemaintenance', svc.canAccessTable('LOGISTICS', 'vehiclemaintenance'), true);

check('AGENT cannot read payroll', svc.canAccessTable('AGENT', 'payroll'), false);
check('RECEPTIONIST cannot read payroll', svc.canAccessTable('RECEPTIONIST', 'payroll'), false);
check('LOGISTICS cannot read payroll', svc.canAccessTable('LOGISTICS', 'payroll'), false);
check('HR can read payroll', svc.canAccessTable('HR', 'payroll'), true);
check('FINANCE can read payroll', svc.canAccessTable('FINANCE', 'payroll'), true);

check('AGENT cannot read vehicle', svc.canAccessTable('AGENT', 'vehicle'), false);
check('HR cannot read vehicle', svc.canAccessTable('HR', 'vehicle'), false);
check('SUPER_ADMIN reads anything', svc.canAccessTable('SUPER_ADMIN', 'payroll'), true);
check('ADMIN reads anything', svc.canAccessTable('ADMIN', 'vehicle'), true);

check('VIEWER can read property', svc.canAccessTable('VIEWER', 'property'), true);
check('VIEWER cannot read lead', svc.canAccessTable('VIEWER', 'lead'), false);
check('VIEWER cannot read employeeprofile', svc.canAccessTable('VIEWER', 'employeeprofile'), false);

// Fail closed, not open.
check('unknown role falls back to VIEWER (no payroll)', svc.canAccessTable('WIZARD', 'payroll'), false);
check('undefined role falls back to VIEWER (no payroll)', svc.canAccessTable(undefined, 'payroll'), false);

console.log('\n=== Column redaction ===\n');

const withSalary = [
  { id: 'e1', userId: 'other-user', department: 'Sales', salary: 250000 },
  { id: 'e2', userId: 'other-user', department: 'HR', salary: 180000 },
];

const agentView = svc.redactRows('AGENT', 'employeeprofile', withSalary);
check('AGENT does not see salary', 'salary' in agentView[0], false);
check('AGENT still sees department', 'department' in agentView[0], true);

const hrView = svc.redactRows('HR', 'employeeprofile', withSalary);
check('HR does see salary', 'salary' in hrView[0], true);

// The case the old shallow mask missed entirely.
const nested = [{
  id: 'a1',
  dateStr: '2026-07-29',
  employeeProfile: { id: 'e1', salary: 250000, user: { firstName: 'Ali', passwordHash: '$2b$xx' } },
}];

const agentNested: any = svc.redactRows('AGENT', 'attendance', nested);
check('AGENT: nested salary redacted through relation', 'salary' in agentNested[0].employeeProfile, false);
check('AGENT: nested passwordHash redacted', 'passwordHash' in agentNested[0].employeeProfile.user, false);
check('AGENT: nested firstName preserved', 'firstName' in agentNested[0].employeeProfile.user, true);

// Credentials are never queryable, even for the highest role.
const superAdminNested: any = svc.redactRows('SUPER_ADMIN', 'attendance', nested);
check('SUPER_ADMIN: passwordHash still redacted', 'passwordHash' in superAdminNested[0].employeeProfile.user, false);
check('SUPER_ADMIN: salary visible', 'salary' in superAdminNested[0].employeeProfile, true);

console.log('\n=== Row-level scoping ===\n');

const agentScope = svc.applyRowLevelSecurity('AGENT', 'lead', { status: 'NEW' }, 'user-123');
const scopeJson = JSON.stringify(agentScope);
check('AGENT lead query is scoped to them', scopeJson.includes('"assignedToId":"user-123"'), true);
check('AGENT original filter preserved', scopeJson.includes('"status":"NEW"'), true);
check('scope is ANDed, not merged', Array.isArray((agentScope as any).AND), true);

// A user-supplied assignedToId must not widen the scope.
const attempted = svc.applyRowLevelSecurity('AGENT', 'lead', { assignedToId: 'someone-else' }, 'user-123');
const attemptedJson = JSON.stringify(attempted);
check('AGENT cannot widen scope via filter', attemptedJson.includes('"assignedToId":"user-123"'), true);
check('  (both conditions present, so it resolves to no rows)', Array.isArray((attempted as any).AND), true);

const adminScope = svc.applyRowLevelSecurity('ADMIN', 'lead', { status: 'NEW' }, 'user-123');
check('ADMIN is not row-scoped', JSON.stringify(adminScope).includes('assignedToId'), false);

const superScope = svc.applyRowLevelSecurity('SUPER_ADMIN', 'lead', { status: 'NEW' }, 'user-123');
check('SUPER_ADMIN is not row-scoped', JSON.stringify(superScope).includes('assignedToId'), false);

console.log('\n=== checkTables aggregate ===\n');
const denied = svc.checkTables('AGENT', ['lead', 'payroll']);
check('mixed request denied on the restricted table', denied.allowed, false);
check('reason names payroll', (denied.reason || '').includes('payroll'), true);

const allowed = svc.checkTables('AGENT', ['lead', 'property']);
check('permitted request allowed', allowed.allowed, true);

console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}\n`);
if (failures > 0) process.exitCode = 1;

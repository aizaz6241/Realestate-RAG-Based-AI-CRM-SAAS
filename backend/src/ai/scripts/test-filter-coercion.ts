/**
 * Filter-repair tests, built from real failures observed in a live transcript.
 *
 *   npm run ai:test-coercion
 *
 * The headline case is the leave query: the assistant reported "there are no pending
 * leave requests" while a PENDING annual request for Sarah Agent sat in the table.
 * Nothing was broken in an obvious way — the model just wrote `status: 'OPEN'`, which
 * is not one of PENDING/APPROVED/REJECTED, so the query matched nothing and zero rows
 * got reported as fact.
 */
import { Logger } from '@nestjs/common';
import { coerceFilters } from '../filter-coercion';

Logger.overrideLogger(['error']);

let failures = 0;

function check(label: string, actual: any, expected: any) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`✅ ${label}`);
  } else {
    failures++;
    console.log(`❌ ${label}\n     expected ${e}\n     got      ${a}`);
  }
}

function checkTrue(label: string, cond: boolean) {
  if (cond) console.log(`✅ ${label}`);
  else { failures++; console.log(`❌ ${label}`); }
}

console.log('\n=== Enum value coercion ===\n');

// THE transcript bug.
{
  const { filters, notes } = coerceFilters('leaverequest', { status: 'OPEN' });
  check('status "OPEN" -> PENDING (leaverequest)', filters, { status: 'PENDING' });
  checkTrue('  repair was recorded', notes.length === 1);
}

check('status "open" lowercase', coerceFilters('leaverequest', { status: 'open' }).filters, { status: 'PENDING' });
check('status "pending" lowercase -> PENDING', coerceFilters('leaverequest', { status: 'pending' }).filters, { status: 'PENDING' });
check('status "Approved" mixed case', coerceFilters('leaverequest', { status: 'Approved' }).filters, { status: 'APPROVED' });
check('status "denied" -> REJECTED', coerceFilters('leaverequest', { status: 'denied' }).filters, { status: 'REJECTED' });
check('typo "PENDNIG" -> PENDING', coerceFilters('leaverequest', { status: 'PENDNIG' }).filters, { status: 'PENDING' });

check('property "available" -> AVAILABLE', coerceFilters('property', { status: 'available' }).filters, { status: 'AVAILABLE' });
check('property "vacant" -> AVAILABLE', coerceFilters('property', { status: 'vacant' }).filters, { status: 'AVAILABLE' });
check('property type "villa" -> VILLA', coerceFilters('property', { type: 'villa' }).filters, { type: 'VILLA' });
check('task "done" -> COMPLETED', coerceFilters('task', { status: 'done' }).filters, { status: 'COMPLETED' });
check('lead "new" -> NEW', coerceFilters('lead', { status: 'new' }).filters, { status: 'NEW' });

// Roman Urdu intent words.
check('roman urdu "khali" -> AVAILABLE', coerceFilters('property', { status: 'khali' }).filters, { status: 'AVAILABLE' });
check('roman urdu "manzoor" -> APPROVED', coerceFilters('leaverequest', { status: 'manzoor' }).filters, { status: 'APPROVED' });

console.log('\n=== Unmappable values are dropped, not queried ===\n');
{
  const { filters, notes } = coerceFilters('leaverequest', { status: 'BANANA', type: 'ANNUAL' });
  check('impossible status dropped, rest kept', filters, { type: 'ANNUAL' });
  checkTrue('  drop was recorded with a reason', notes.some(n => n.to === undefined && /false empty/.test(n.reason)));
}

console.log('\n=== Relation name aliasing ===\n');

// The hard failure the user saw: "Field 'name' in filters.user is not a column".
{
  const { filters, notes } = coerceFilters('employeeprofile', { user: { name: 'sara' } });
  const asJson = JSON.stringify(filters);
  checkTrue('user.name expands to firstName/lastName OR', asJson.includes('firstName') && asJson.includes('lastName'));
  checkTrue('  match is case-insensitive', asJson.includes('insensitive'));
  checkTrue('  uses contains so "sara" matches "Sarah"', asJson.includes('contains'));
  checkTrue('  expansion was recorded', notes.some(n => /no "name" column/.test(n.reason)));
}

{
  const { filters } = coerceFilters('attendance', {
    employeeProfile: { user: { name: 'sara' } },
  });
  const asJson = JSON.stringify(filters);
  checkTrue('two-hop attendance -> employeeProfile -> user.name expands', asJson.includes('firstName') && asJson.includes('lastName'));
}

// Observed live: the model wrote { employeeProfile: { name: 'sara' } } on leaverequest.
// EmployeeProfile has no name of its own — the person lives on .user — so this failed
// validation and surfaced a raw schema error to the user.
{
  const { filters, notes } = coerceFilters('leaverequest', {
    employeeProfile: { name: 'sara' },
    status: 'PENDING',
  });
  const asJson = JSON.stringify(filters);
  checkTrue('employeeProfile.name pushes down through the user relation', asJson.includes('firstName') && asJson.includes('lastName'));
  checkTrue('  routed via user', asJson.includes('user'));
  checkTrue('  sibling status filter preserved', asJson.includes('PENDING'));
  checkTrue('  push-down recorded', notes.some(n => /no "name" column/.test(n.reason)));
}

console.log('\n=== Dotted SQL-style paths ===\n');

// Observed live on "best performance employee with good attendance": the model wrote
// { "attendance.status": "PRESENT" } instead of nesting it.
{
  const { filters } = coerceFilters('employeeprofile', { 'attendance.status': 'PRESENT' });
  const asJson = JSON.stringify(filters);
  // Prisma declares the collection as `attendances`; the model writes the singular.
  checkTrue('attendance.status resolves to the attendances relation', asJson.includes('"attendances"') && asJson.includes('PRESENT'));
  checkTrue('  to-many relation wrapped in `some`', asJson.includes('"some"'));
  checkTrue('  dotted key is gone', !asJson.includes('attendance.status'));
}

{
  // Head that is not a relation stays put, so validation can report it clearly
  // instead of the coercer inventing structure.
  const { filters } = coerceFilters('property', { 'nonsense.field': 'x' });
  checkTrue('unknown dotted head left intact for validation', 'nonsense.field' in filters);
}

// Observed live: the model qualified every filter with the table name, SQL-style.
{
  const { filters } = coerceFilters('leaverequest', {
    'leaverequest.status': 'PENDING',
    'leaverequest.type': 'ANNUAL',
  });
  check('redundant table prefix stripped', filters, { status: 'PENDING', type: 'ANNUAL' });
}

{
  // Prefix strip must compose with the person push-down.
  const { filters } = coerceFilters('leaverequest', { 'leaverequest.employeeProfile': { name: 'sara' } });
  const asJson = JSON.stringify(filters);
  checkTrue('prefix strip composes with name push-down', asJson.includes('firstName') && asJson.includes('user'));
}

console.log('\n=== Structure is preserved ===\n');

check(
  'non-enum fields untouched',
  coerceFilters('property', { location: { contains: 'JVC', mode: 'insensitive' } }).filters,
  { location: { contains: 'JVC', mode: 'insensitive' } }
);

check(
  'numeric filters untouched',
  coerceFilters('property', { price: { lte: 2000000 }, bedrooms: 3 }).filters,
  { price: { lte: 2000000 }, bedrooms: 3 }
);

{
  const { filters } = coerceFilters('property', {
    OR: [{ status: 'available' }, { status: 'published' }],
  });
  check('OR branches coerced', filters, { OR: [{ status: 'AVAILABLE' }, { status: 'PUBLISHED' }] });
}

console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}\n`);
if (failures > 0) process.exitCode = 1;

/**
 * Self-test for FactVerifierService.
 *
 * Run: npx ts-node src/ai/scripts/verify-fact-checker.ts
 *
 * The verifier replaced an LLM-based hallucination audit, so its behaviour needs to
 * be pinned by cases rather than trusted. The bias under test is deliberate:
 * fabrications must be caught, and legitimate answers must NOT be flagged — a false
 * positive triggers a pointless regeneration and degrades the reply.
 */
import { FactVerifierService } from '../fact-verifier.service';

const verifier = new FactVerifierService();

type Case = {
  name: string;
  response: string;
  rows: any[];
  context?: any;
  expectPass: boolean;
};

const rows = [
  { id: 'u1', title: 'Marina View Apartment', price: 1250000, location: 'Dubai Marina', bedrooms: 2 },
  { id: 'u2', title: 'JVC Studio', price: 550000, location: 'JVC', bedrooms: 1 },
];

const cases: Case[] = [
  // --- must PASS ---
  {
    name: 'grounded listing',
    response: 'You have 2 listings: **Marina View Apartment** in Dubai Marina at AED 1,250,000, and **JVC Studio** in JVC at AED 550,000.',
    rows,
    expectPass: true,
  },
  {
    name: 'grounded aggregate (sum)',
    response: 'Combined value of both listings is AED 1,800,000.',
    rows,
    expectPass: true,
  },
  {
    name: 'grounded aggregate (average)',
    response: 'The average asking price is AED 900,000 across your listings.',
    rows,
    expectPass: true,
  },
  {
    name: 'honest empty result',
    response: 'I could not find any properties matching that filter. No records were found.',
    rows: [],
    expectPass: true,
  },
  {
    name: 'honest empty result in roman urdu',
    response: 'Is filter par koi record nahi mila. Aap date range badal kar dekh sakte hain.',
    rows: [],
    expectPass: true,
  },
  {
    name: 'prose with small ordinals is not a claim',
    response: 'Here are the top 2 results, sorted by price. 3 filters were applied.',
    rows,
    expectPass: true,
  },
  {
    name: 'year mentioned in narration',
    response: 'Both listings were added in 2024 and remain active. Marina View Apartment is the higher priced one.',
    rows,
    expectPass: true,
  },

  // --- must FAIL ---
  {
    name: 'fabricated list on empty result set',
    response: 'Here are your properties:\n- Palm Villa, AED 8,000,000\n- Downtown Loft, AED 2,300,000',
    rows: [],
    expectPass: false,
  },
  {
    name: 'fabricated table on empty result set',
    response: 'Sure:\n\n| Property | Price |\n| --- | --- |\n| Palm Villa | 8000000 |',
    rows: [],
    expectPass: false,
  },
  {
    name: 'ungrounded price figure',
    response: 'Marina View Apartment is listed at AED 9,999,999.',
    rows,
    expectPass: false,
  },
  {
    name: 'ungrounded entity name',
    response: 'Your listings include Marina View Apartment and also Sunset Tower in Business Bay.',
    rows,
    expectPass: false,
  },
  {
    name: 'leave records claimed but never queried',
    response: 'Ahmed has 3 pending sick leave requests awaiting approval this month.',
    rows: [{ id: 'e1', department: 'Sales' }],
    context: { tablesUsed: ['employeeprofile'] },
    expectPass: false,
  },
  {
    name: 'payroll claimed but never queried',
    response: 'The net salary processed was AED 45,500 for the period.',
    rows: [{ id: 'e1', department: 'Sales' }],
    context: { tablesUsed: ['employeeprofile'] },
    expectPass: false,
  },
];

let passed = 0;
let failed = 0;

console.log('\n=== FactVerifierService self-test ===\n');

for (const c of cases) {
  const report = verifier.verify(c.response, c.rows, c.context ?? {});
  const ok = report.passed === c.expectPass;

  if (ok) {
    passed++;
    console.log(`✅ ${c.name}`);
  } else {
    failed++;
    console.log(`❌ ${c.name}`);
    console.log(`     expected passed=${c.expectPass}, got passed=${report.passed}`);
    if (report.violations.length) {
      report.violations.forEach(v => console.log(`     - [${v.rule}] ${v.detail}`));
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;

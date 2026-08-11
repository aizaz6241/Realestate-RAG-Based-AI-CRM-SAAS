/**
 * Validates every few-shot example in query-examples.ts against SCHEMA_REGISTRY.
 *
 *   npx ts-node src/ai/scripts/validate-examples.ts
 *
 * A wrong example is worse than no example: it actively teaches the model a shape
 * that will fail at execution. This runs the same deterministic validator the
 * pipeline uses, so an example can never drift from the schema unnoticed.
 */
import { Logger } from '@nestjs/common';
import {
  SCHEMA_REGISTRY,
  SCHEMA_RELATION_REGISTRY,
  DatabasePipelineService,
} from '../database-pipeline.service';
import { QUERY_EXAMPLES, selectExamples } from '../query-examples';

Logger.overrideLogger(['error']);

const tables = SCHEMA_REGISTRY.tables as Record<string, any>;

console.log('\n=== Schema columns ===\n');
for (const [name, def] of Object.entries(tables)) {
  console.log(`${name}: ${Object.keys(def.columns || {}).join(', ')}`);
}
console.log(`\nrelation registry: ${Object.keys(SCHEMA_RELATION_REGISTRY).join(', ')}\n`);

// Validate through the SAME method the pipeline uses, so an example can never pass
// here and then be rejected at runtime (or vice versa). The validator touches only
// the schema registries, so the injected dependencies are unused.
const pipeline = new DatabasePipelineService(null as any, null as any, null as any, null as any);

let failures = 0;

console.log('=== Example validation ===\n');

for (const ex of QUERY_EXAMPLES) {
  const problems: string[] = [];

  const result = pipeline.validateQueryPlanAgainstSchema(ex.plan);
  if (!result.isValid) problems.push(result.errorMsg || 'invalid');

  if (!['fetch', 'aggregate', 'compare', 'analyze'].includes(ex.plan.operation)) {
    problems.push(`operation "${ex.plan.operation}" is not one of fetch|aggregate|compare|analyze`);
  }

  if (problems.length === 0) {
    console.log(`✅ ${ex.question}`);
  } else {
    failures++;
    console.log(`❌ ${ex.question}`);
    problems.forEach(p => console.log(`     - ${p}`));
  }
}

// Negative controls: the validator must actually reject bad plans, not just accept
// everything. Without these, a validator that always returns valid would look green.
console.log('\n=== Validator negative controls ===\n');
const badPlans: { label: string; plan: any }[] = [
  { label: 'nonexistent table', plan: { operation: 'fetch', entities: ['unicorns'], filters: {} } },
  { label: 'nonexistent column', plan: { operation: 'fetch', entities: ['property'], filters: { colour: 'red' } } },
  { label: 'typo column', plan: { operation: 'fetch', entities: ['property'], filters: { pirce: { lte: 100 } } } },
  { label: 'bad groupBy', plan: { operation: 'aggregate', entities: ['property'], filters: {}, groupBy: ['neighbourhood'] } },
  { label: 'empty entities', plan: { operation: 'fetch', entities: [], filters: {} } },
];

for (const { label, plan } of badPlans) {
  const r = pipeline.validateQueryPlanAgainstSchema(plan);
  if (r.isValid) {
    failures++;
    console.log(`❌ ${label}: validator wrongly accepted this plan`);
  } else {
    console.log(`✅ ${label}: rejected — ${(r.errorMsg || '').slice(0, 90)}`);
  }
}

// SQL-flavoured plans the model actually produces. These must normalize into a
// valid plan rather than costing a repair call — observed live: the model answered
// "how many properties" with metrics: ["count(id)"], which failed validation,
// failed repair, and surfaced as an error to the user.
console.log('\n=== Plan normalization (SQL-flavoured model output) ===\n');
const sqlish: { label: string; plan: any }[] = [
  { label: 'metrics count(id)', plan: { operation: 'aggregate', entities: ['property'], filters: {}, metrics: ['count(id)'] } },
  { label: 'metrics COUNT(*)', plan: { operation: 'aggregate', entities: ['property'], filters: {}, metrics: ['COUNT(*)'] } },
  { label: 'metrics SUM(price)', plan: { operation: 'aggregate', entities: ['property'], filters: {}, metrics: ['SUM(price)'] } },
  { label: 'metrics AVG(price) + groupBy', plan: { operation: 'aggregate', entities: ['property'], filters: {}, metrics: ['AVG(price)'], groupBy: ['location'] } },
  { label: 'uppercase entity', plan: { operation: 'fetch', entities: ['Property'], filters: {} } },
  { label: 'metrics total(netSalary)', plan: { operation: 'aggregate', entities: ['payroll'], filters: {}, metrics: ['total(netSalary)'] } },
];

for (const { label, plan } of sqlish) {
  const normalized = pipeline.normalizeGeneratedPlan(plan);
  const r = pipeline.validateQueryPlanAgainstSchema(normalized);
  if (r.isValid) {
    console.log(`✅ ${label} -> ${JSON.stringify({ operation: normalized.operation, metrics: normalized.metrics, groupBy: normalized.groupBy })}`);
  } else {
    failures++;
    console.log(`❌ ${label}: still invalid after normalization — ${r.errorMsg}`);
  }
}

// Retrieval sanity: a representative question should pull relevant examples.
console.log('\n=== Retrieval check ===\n');
const probes = [
  { q: 'how many properties do we have', wantEntity: 'property' },
  { q: 'is mahine ki attendance dikhao', wantEntity: 'attendance' },
  { q: 'pending leave requests', wantEntity: 'leaverequest' },
  { q: 'show tasks assigned to Sarah', wantEntity: 'task' },
];

for (const { q, wantEntity } of probes) {
  const picked = selectExamples(q, [wantEntity], 4);
  const hit = picked.some(p => (p.plan.entities || []).includes(wantEntity));
  console.log(`${hit ? '✅' : '❌'} "${q}" -> ${picked.length} example(s)` +
    `${picked.length ? ` [${picked.map(p => (p.plan.entities || []).join('+')).join(', ')}]` : ''}`);
  if (!hit) failures++;
}

console.log(`\n${QUERY_EXAMPLES.length} examples, ${failures} problem(s)\n`);
if (failures > 0) process.exitCode = 1;

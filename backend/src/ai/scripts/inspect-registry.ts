/**
 * Prints what the merged schema registry actually resolved to.
 *
 *   npm run ai:inspect-schema
 *
 * Useful after `npm run ai:gen-schema` to confirm enum values, relationships and
 * synonyms landed — those are the three things the old hand-written registry lacked.
 */
import { SCHEMA_REGISTRY, SCHEMA_RELATION_REGISTRY, getEnumValues, resolveTableSynonym, buildTableCatalogue } from '../schema-registry';

const tables = Object.keys(SCHEMA_REGISTRY.tables);

console.log('\n=== Coverage ===');
console.log(`tables          : ${tables.length}   (hand-written registry had 25)`);
console.log(`tables w/ rels  : ${Object.keys(SCHEMA_RELATION_REGISTRY).length}   (had 4)`);

let enumCols = 0;
let synonymTables = 0;
for (const key of tables) {
  enumCols += Object.keys(SCHEMA_REGISTRY.tables[key].enums).length;
  if (SCHEMA_REGISTRY.tables[key].synonyms.length) synonymTables++;
}
console.log(`columns w/ allowed values: ${enumCols}   (had 0 machine-readable)`);
console.log(`tables w/ synonyms       : ${synonymTables}   (had 0)`);

console.log('\n=== Column descriptions (the part the model reads) ===');
for (const [t, c] of [['property', 'status'], ['property', 'location'], ['attendance', 'dateStr'], ['lead', 'status'], ['task', 'status'], ['employeeprofile', 'salary']] as const) {
  const desc = SCHEMA_REGISTRY.tables[t]?.columns[c];
  console.log(`${t}.${c}\n    ${desc}`);
}

console.log('\n=== Machine-readable allowed values ===');
for (const [t, c] of [['property', 'status'], ['property', 'type'], ['lead', 'status'], ['leaverequest', 'status'], ['client', 'stage']] as const) {
  console.log(`${t}.${c} -> ${JSON.stringify(getEnumValues(t, c))}`);
}

console.log('\n=== Synonym resolution (how users actually talk) ===');
for (const term of ['real estate', 'listings', 'units', 'staff', 'personnel', 'villa', 'customers', 'inventory', 'company']) {
  console.log(`${JSON.stringify(term).padEnd(14)} -> ${resolveTableSynonym(term) ?? '(no match)'}`);
}

console.log('\n=== Relationship graph sample ===');
for (const t of ['property', 'attendance', 'task']) {
  const rels = (SCHEMA_RELATION_REGISTRY as any)[t]?.relations ?? {};
  console.log(`${t}: ${Object.keys(rels).join(', ') || '(none)'}`);
}

const catalogue = buildTableCatalogue();
console.log(`\n=== Planner catalogue: ${catalogue.split('\n').length} lines, ~${Math.round(catalogue.length / 4)} tokens ===`);
console.log(catalogue.split('\n').slice(0, 5).join('\n'));
console.log('...\n');

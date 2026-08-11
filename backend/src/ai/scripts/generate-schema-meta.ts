/**
 * Generates src/ai/schema-meta.generated.ts from prisma/schema.prisma.
 *
 *   npm run ai:gen-schema
 *
 * WHY
 *
 * The AI schema dictionary describes `status` as `type: 'string'` with no values.
 * That is the difference between the model emitting `status: 'AVAILABLE'` (matches)
 * and `status: 'available'` (returns nothing, looks like empty data). The real
 * allowed values live in trailing comments in schema.prisma:
 *
 *     status  String  // DRAFT, PUBLISHED, SOLD, RENTED, AVAILABLE
 *
 * Parsing them here keeps the AI's view of the schema in lockstep with Prisma
 * instead of drifting from a hand-maintained copy.
 *
 * Also captures scalar types, optionality, defaults and relation targets.
 */
import * as fs from 'fs';
import * as path from 'path';

interface FieldMeta {
  name: string;
  type: string;
  isList: boolean;
  isOptional: boolean;
  default?: string;
  /** Allowed values parsed from the trailing comment, when it looks like an enum. */
  enumValues?: string[];
  /** Target model for relation fields. */
  relationTo?: string;
  comment?: string;
}

interface ModelMeta {
  name: string;
  fields: FieldMeta[];
}

const SCALARS = new Set([
  'String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal', 'BigInt', 'Bytes',
]);

function parseSchema(src: string): { models: ModelMeta[]; enums: Record<string, string[]> } {
  const models: ModelMeta[] = [];
  const enums: Record<string, string[]> = {};

  // Declared Prisma enums.
  for (const m of src.matchAll(/^enum\s+(\w+)\s*\{([^}]*)\}/gm)) {
    enums[m[1]] = m[2]
      .split('\n')
      .map(l => l.replace(/\/\/.*$/, '').trim())
      .filter(l => l && /^\w+$/.test(l));
  }

  for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const modelName = m[1];
    const body = m[2];
    const fields: FieldMeta[] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

      // name  Type[]?  @attrs  // comment
      const fm = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!fm) continue;

      const [, name, type, list, optional, rest] = fm;
      const commentMatch = /\/\/\s*(.+)$/.exec(rest);
      const comment = commentMatch ? commentMatch[1].trim() : undefined;
      // One level of nesting so `@default(uuid())` and `@default(now())` capture
      // "uuid()" rather than truncating at the inner paren.
      const defaultMatch = /@default\(((?:[^()]|\([^()]*\))*)\)/.exec(rest);

      const field: FieldMeta = {
        name,
        type,
        isList: Boolean(list),
        isOptional: Boolean(optional),
      };

      if (defaultMatch) field.default = defaultMatch[1].replace(/^["']|["']$/g, '');
      if (comment) field.comment = comment;

      // A comment listing 2+ ALL_CAPS tokens is an enum-in-a-String. Guard against
      // prose comments by requiring the whole comment to be that shape.
      if (comment && type === 'String') {
        const cleaned = comment.replace(/,?\s*etc\.?$/i, '').trim();
        const tokens = cleaned.split(/\s*,\s*/).map(t => t.trim());
        const looksEnum =
          tokens.length >= 2 &&
          tokens.every(t => /^[A-Z][A-Z0-9_]*$/.test(t));
        if (looksEnum) field.enumValues = tokens;
      }

      if (enums[type]) field.enumValues = enums[type];

      // Non-scalar, non-enum types are relations.
      if (!SCALARS.has(type) && !enums[type]) field.relationTo = type;

      fields.push(field);
    }

    models.push({ name: modelName, fields });
  }

  return { models, enums };
}

function render(models: ModelMeta[], enums: Record<string, string[]>): string {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * GENERATED FILE — DO NOT EDIT BY HAND.');
  lines.push(' *');
  lines.push(' * Regenerate with: npm run ai:gen-schema');
  lines.push(' * Source: prisma/schema.prisma');
  lines.push(' *');
  lines.push(' * Carries the facts the AI schema dictionary omits — allowed values for');
  lines.push(' * status/type columns, scalar types, defaults and relation targets. Without the');
  lines.push(' * allowed values the model emits `status: "available"` instead of "AVAILABLE"');
  lines.push(' * and the query silently returns nothing.');
  lines.push(' */');
  lines.push('');
  lines.push('export interface GeneratedField {');
  lines.push('  name: string;');
  lines.push('  type: string;');
  lines.push('  isList: boolean;');
  lines.push('  isOptional: boolean;');
  lines.push('  default?: string;');
  lines.push('  enumValues?: string[];');
  lines.push('  relationTo?: string;');
  lines.push('  comment?: string;');
  lines.push('}');
  lines.push('');
  lines.push('export interface GeneratedModel {');
  lines.push('  name: string;');
  lines.push('  fields: GeneratedField[];');
  lines.push('}');
  lines.push('');
  lines.push(`export const PRISMA_ENUMS: Record<string, string[]> = ${JSON.stringify(enums, null, 2)};`);
  lines.push('');
  lines.push('export const PRISMA_MODELS: Record<string, GeneratedModel> = {');

  for (const model of models) {
    lines.push(`  ${model.name}: {`);
    lines.push(`    name: '${model.name}',`);
    lines.push('    fields: [');
    for (const f of model.fields) {
      const parts = [
        `name: ${JSON.stringify(f.name)}`,
        `type: ${JSON.stringify(f.type)}`,
        `isList: ${f.isList}`,
        `isOptional: ${f.isOptional}`,
      ];
      if (f.default !== undefined) parts.push(`default: ${JSON.stringify(f.default)}`);
      if (f.enumValues) parts.push(`enumValues: ${JSON.stringify(f.enumValues)}`);
      if (f.relationTo) parts.push(`relationTo: ${JSON.stringify(f.relationTo)}`);
      if (f.comment) parts.push(`comment: ${JSON.stringify(f.comment)}`);
      lines.push(`      { ${parts.join(', ')} },`);
    }
    lines.push('    ],');
    lines.push('  },');
  }

  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const outPath = path.resolve(process.cwd(), 'src/ai/schema-meta.generated.ts');

  const src = fs.readFileSync(schemaPath, 'utf8');
  const { models, enums } = parseSchema(src);

  fs.writeFileSync(outPath, render(models, enums), 'utf8');

  const enumFields = models.flatMap(m => m.fields.filter(f => f.enumValues));
  const relFields = models.flatMap(m => m.fields.filter(f => f.relationTo));

  console.log(`\n✅ Wrote ${path.relative(process.cwd(), outPath)}`);
  console.log(`   models            : ${models.length}`);
  console.log(`   prisma enums      : ${Object.keys(enums).length}`);
  console.log(`   fields with values: ${enumFields.length}`);
  console.log(`   relation fields   : ${relFields.length}\n`);

  for (const m of models.slice(0, 0)) console.log(m.name);
}

main();

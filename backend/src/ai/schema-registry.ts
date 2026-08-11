import { SchemaDictionary, SchemaTable } from './schema-dictionary';
import { PRISMA_MODELS, GeneratedField } from './schema-meta.generated';

/**
 * The AI's view of the database schema, merged from three sources.
 *
 * Each source knows something the others don't, and the previous hand-written
 * registry had only 25 tables with no synonyms and no relationship graph:
 *
 *   1. `schema-dictionary.ts` — 44 tables with natural-language **synonyms**
 *      ("real estate", "listing", "unit", "villa" -> Property). This is what lets
 *      entity mapping resolve how users actually talk.
 *
 *   2. `schema-meta.generated.ts` — parsed from prisma/schema.prisma, so it carries
 *      the **allowed values** for status/type columns, scalar types, defaults and the
 *      full relation graph. This is the load-bearing part: the dictionary types
 *      `status` as a plain string, and without "AVAILABLE" in the prompt the model
 *      emits `status: "available"`, matches nothing, and the empty result is
 *      indistinguishable from having no data.
 *
 *   3. `CURATED_DESCRIPTIONS` below — human notes for the handful of columns whose
 *      meaning isn't obvious from the name.
 *
 * Regenerate source 2 after any schema change: `npm run ai:gen-schema`.
 *
 * The exported shape stays backward compatible with the original registry
 * (`tables[lowercasekey].columns[colName] = description`) so existing consumers —
 * the planner prompt, semantic mapping, and the plan validator — keep working.
 */

/** Human notes for columns whose purpose isn't inferable from the name. */
const CURATED_DESCRIPTIONS: Record<string, Record<string, string>> = {
  property: {
    price: 'asking price or rental amount (AED)',
    location: 'geographical location, free text (e.g. Dubai Marina, JVC, Downtown). Always filter with contains + insensitive.',
    areaSqft: 'total area in square feet',
    ownerId: 'link to landlord/owner profile',
  },
  employeeprofile: {
    salary: 'monthly base salary — RESTRICTED for most roles',
    designation: 'job title (e.g. agent, manager, COO)',
  },
  attendance: {
    dateStr: "attendance date as a 'YYYY-MM-DD' string. Compare as a string; it sorts correctly.",
  },
  payroll: {
    month: "payroll period as a 'YYYY-MM' string",
    netSalary: 'net payout after allowances and deductions',
  },
  client: {
    budget: 'target investment/rental budget (AED)',
  },
  lead: {
    score: 'lead score index (higher is hotter)',
  },
};

/** Relation fields that are collections rather than a single joined record. */
function isCollection(field: GeneratedField): boolean {
  return field.isList;
}

function describeField(table: string, field: GeneratedField, dictSynonyms: string[]): string {
  const curated = CURATED_DESCRIPTIONS[table]?.[field.name];
  const parts: string[] = [];

  if (curated) {
    parts.push(curated);
  } else if (field.enumValues) {
    // Allowed values first — this is the part the model most needs.
    parts.push(`one of: ${field.enumValues.join(', ')}`);
  } else if (field.relationTo) {
    parts.push(
      isCollection(field)
        ? `Relation to ${field.relationTo} (many). Filter with { ${field.name}: { some: { ... } } }.`
        : `Relation to ${field.relationTo}. Filter by nesting, e.g. { ${field.name}: { ... } }.`
    );
  } else {
    parts.push(mapType(field));
  }

  // Enum values matter even when a curated note exists.
  if (curated && field.enumValues) parts.push(`Allowed values: ${field.enumValues.join(', ')}`);
  if (field.isOptional && !field.relationTo) parts.push('nullable');
  if (dictSynonyms.length) parts.push(`aka: ${dictSynonyms.join(', ')}`);

  return parts.join('. ');
}

function mapType(field: GeneratedField): string {
  const base = {
    String: 'text',
    Int: 'integer',
    Float: 'number',
    Boolean: 'true/false',
    DateTime: 'timestamp',
    Json: 'json object',
    Decimal: 'decimal number',
    BigInt: 'big integer',
  }[field.type] ?? field.type;
  return field.isList ? `array of ${base}` : base;
}

export interface RegistryTable {
  name: string;
  description: string;
  synonyms: string[];
  columns: Record<string, string>;
  /** Allowed values per column, for deterministic validation. */
  enums: Record<string, string[]>;
}

function build(): {
  tables: Record<string, RegistryTable>;
  relations: Record<string, { relations: Record<string, { model: string; foreignKey: string; fields: string[] }> }>;
} {
  const tables: Record<string, RegistryTable> = {};
  const relations: Record<string, any> = {};

  for (const [modelName, model] of Object.entries(PRISMA_MODELS)) {
    const key = modelName.toLowerCase();
    const dict: SchemaTable | undefined = (SchemaDictionary as any)[modelName];

    const columns: Record<string, string> = {};
    const enums: Record<string, string[]> = {};
    const rels: Record<string, { model: string; foreignKey: string; fields: string[] }> = {};

    for (const field of model.fields) {
      const dictCol = dict?.columns.find(c => c.name === field.name);
      columns[field.name] = describeField(key, field, dictCol?.synonyms ?? []);

      if (field.enumValues) enums[field.name] = field.enumValues;

      if (field.relationTo) {
        const target = PRISMA_MODELS[field.relationTo];
        // Expose a few useful scalar fields of the target so nested filters can be
        // validated without loading the whole target table.
        const targetFields = target
          ? target.fields
              .filter(f => !f.relationTo && !f.isList)
              .map(f => f.name)
              .slice(0, 30)
          : [];

        rels[field.name] = {
          model: field.relationTo.toLowerCase(),
          foreignKey: `${field.name}Id`,
          fields: targetFields,
        };
      }
    }

    tables[key] = {
      name: modelName,
      description: dict?.description || `Records for ${modelName}.`,
      synonyms: dict?.synonyms ?? [],
      columns,
      enums,
    };

    if (Object.keys(rels).length) relations[key] = { relations: rels };
  }

  return { tables, relations };
}

const built = build();

/** Backward-compatible shape: tables[key].columns[col] = description. */
export const SCHEMA_REGISTRY = { tables: built.tables };

/** relations[table].relations[relName] = { model, foreignKey, fields }. */
export const SCHEMA_RELATION_REGISTRY = built.relations;

/** Allowed values per table/column, for deterministic filter validation. */
export function getEnumValues(table: string, column: string): string[] | null {
  return built.tables[table.toLowerCase()]?.enums?.[column] ?? null;
}

/**
 * Resolves how a user referred to a table into its registry key, using the
 * dictionary's synonyms. "real estate" / "listings" / "units" -> property.
 */
export function resolveTableSynonym(term: string): string | null {
  const needle = term.toLowerCase().trim();
  if (built.tables[needle]) return needle;

  // Exact synonym match first, then singular/plural tolerance.
  for (const [key, table] of Object.entries(built.tables)) {
    if (table.synonyms.some(s => s.toLowerCase() === needle)) return key;
  }
  const singular = needle.replace(/(ies)$/, 'y').replace(/s$/, '');
  for (const [key, table] of Object.entries(built.tables)) {
    if (key === singular) return key;
    if (table.synonyms.some(s => s.toLowerCase().replace(/(ies)$/, 'y').replace(/s$/, '') === singular)) return key;
  }
  return null;
}

/** Compact "key: description" catalogue for planner prompts (names only, no columns). */
export function buildTableCatalogue(): string {
  return Object.entries(built.tables)
    .map(([key, t]) => {
      const aka = t.synonyms.length ? ` (aka: ${t.synonyms.slice(0, 5).join(', ')})` : '';
      return `- ${key}: ${t.description}${aka}`;
    })
    .join('\n');
}

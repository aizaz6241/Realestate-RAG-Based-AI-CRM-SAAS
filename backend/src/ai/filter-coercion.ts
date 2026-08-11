import { getEnumValues, SCHEMA_RELATION_REGISTRY, SCHEMA_REGISTRY } from './schema-registry';

/**
 * Repairs generated filters before they reach the database.
 *
 * Two failure modes this exists for, both observed in production transcripts:
 *
 * 1. **Wrong enum value → confident false negative.** Asked "any leave applications
 *    still open?", the model emitted `status: 'OPEN'`. The allowed values are
 *    PENDING / APPROVED / REJECTED, so the query matched nothing and the assistant
 *    answered "there are no pending leave requests" — while a PENDING annual leave
 *    request sat in the table. A zero-row result is indistinguishable from truth to
 *    everything downstream, which makes this the most dangerous class of bug in the
 *    pipeline: it produces a confident, specific, wrong answer.
 *
 * 2. **Aliased relation fields → hard failure.** `{ user: { name: 'sara' } }` is the
 *    natural shape, but User stores firstName/lastName and has no `name` column, so
 *    validation rejected the plan and the user saw a raw schema error.
 *
 * Both are repaired here rather than sent back to the model, because the intent is
 * unambiguous and a repair round trip costs a second or more.
 */

/** Intent words users say, mapped to the enum values that satisfy them. */
const VALUE_SYNONYMS: Record<string, string[]> = {
  open: ['PENDING', 'NEW', 'IN_PROGRESS', 'ACTIVE', 'AVAILABLE'],
  outstanding: ['PENDING', 'NEW', 'IN_PROGRESS'],
  unresolved: ['PENDING', 'NEW', 'IN_PROGRESS'],
  waiting: ['PENDING'],
  awaiting: ['PENDING'],
  unapproved: ['PENDING'],
  active: ['ACTIVE', 'AVAILABLE', 'PUBLISHED', 'IN_PROGRESS', 'NEW'],
  ongoing: ['IN_PROGRESS', 'ACTIVE'],
  closed: ['CLOSED', 'COMPLETED', 'SOLD', 'REJECTED'],
  done: ['COMPLETED', 'CLOSED'],
  finished: ['COMPLETED', 'CLOSED'],
  complete: ['COMPLETED'],
  completed: ['COMPLETED', 'CLOSED'],
  accepted: ['APPROVED'],
  granted: ['APPROVED'],
  denied: ['REJECTED'],
  declined: ['REJECTED'],
  cancelled: ['REJECTED', 'CANCELLED'],
  unsold: ['AVAILABLE', 'PUBLISHED'],
  vacant: ['AVAILABLE'],
  free: ['AVAILABLE'],
  // Roman Urdu
  khali: ['AVAILABLE'],
  bika: ['SOLD'],
  manzoor: ['APPROVED'],
  namanzoor: ['REJECTED'],
  baqi: ['PENDING'],
};

function levenshtein(a: string, b: string): number {
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

/**
 * Matches a relation name the model wrote against the real one.
 *
 * Models write the singular ("attendance.status") where Prisma declares the
 * collection ("attendances"), so exact matching alone misses the common case.
 */
function resolveRelationName(name: string, relations: Record<string, any>): string | null {
  const keys = Object.keys(relations);
  const needle = name.toLowerCase();

  const exact = keys.find(k => k.toLowerCase() === needle);
  if (exact) return exact;

  const depluralize = (s: string) => s.replace(/ies$/i, 'y').replace(/s$/i, '');
  const singular = depluralize(needle);
  const byStem = keys.find(k => depluralize(k.toLowerCase()) === singular);
  return byStem ?? null;
}

export interface CoercionNote {
  path: string;
  from: any;
  to: any;
  reason: string;
}

/**
 * Coerces a single value against an allowed set.
 * Returns null when nothing plausible matches — the caller then drops the filter
 * rather than sending a query guaranteed to return nothing.
 */
function coerceEnumValue(raw: string, allowed: string[]): string | string[] | null {
  const value = raw.trim();
  const upper = value.toUpperCase().replace(/[\s-]+/g, '_');

  // Exact, case-insensitive.
  const exact = allowed.find(a => a.toUpperCase() === upper);
  if (exact) return exact;

  // Known intent word.
  const synonyms = VALUE_SYNONYMS[value.toLowerCase()];
  if (synonyms) {
    const matches = allowed.filter(a => synonyms.includes(a.toUpperCase()));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return matches; // becomes an `in` filter
  }

  // Typo tolerance.
  let best: string | null = null;
  let bestScore = Infinity;
  for (const a of allowed) {
    const d = levenshtein(upper, a.toUpperCase());
    if (d < bestScore) { bestScore = d; best = a; }
  }
  if (best && bestScore <= Math.max(2, Math.floor(upper.length / 3))) return best;

  return null;
}

/**
 * Person-name filters: `{ name: 'sara' }` on a model that stores firstName/lastName.
 * Expands to a case-insensitive OR across both, so partial and mis-cased names match.
 */
function expandNameFilter(value: any): any {
  const term = typeof value === 'string'
    ? value
    : (value?.contains ?? value?.equals ?? null);

  if (typeof term !== 'string' || !term.trim()) return null;

  return {
    OR: [
      { firstName: { contains: term.trim(), mode: 'insensitive' } },
      { lastName: { contains: term.trim(), mode: 'insensitive' } },
    ],
  };
}

/**
 * Walks a filter tree, coercing enum values and expanding aliased fields.
 * Returns the repaired filters plus a list of what changed, so the pipeline can
 * tell the user when a filter was dropped instead of silently returning everything.
 */
export function coerceFilters(
  table: string,
  filters: any,
  notes: CoercionNote[] = [],
  path = 'filters',
  depth = 0
): { filters: any; notes: CoercionNote[] } {
  if (!filters || typeof filters !== 'object' || depth > 6) return { filters, notes };

  const tableKey = table.toLowerCase();
  const relations = SCHEMA_RELATION_REGISTRY[tableKey]?.relations ?? {};
  const columns = SCHEMA_REGISTRY.tables[tableKey]?.columns ?? {};
  const out: Record<string, any> = {};

  // Dotted paths first: models reach for SQL notation and write
  // `{ "attendance.status": "PRESENT" }` instead of `{ attendance: { status: ... } }`.
  // Rejecting that costs a repair call for an unambiguous intent, so it is expanded
  // into the nested form before anything else looks at the keys.
  const expanded: Record<string, any> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!key.includes('.')) {
      expanded[key] = value;
      continue;
    }
    const [head, ...rest] = key.split('.');

    // The model often qualifies filters with the table itself, SQL-style:
    // `{ "leaverequest.status": "PENDING" }`. Strip that prefix and treat the
    // remainder as a plain field on the current table.
    if (head.toLowerCase() === tableKey && rest.length > 0) {
      const remainder = rest.join('.');
      notes.push({
        path: `${path}.${key}`,
        from: key,
        to: remainder,
        reason: 'stripped redundant table-name prefix from filter key',
      });
      // Re-enter the loop body for the unqualified key by folding it back in.
      const sub = coerceFilters(table, { [remainder]: value }, notes, path, depth + 1).filters;
      Object.assign(expanded, sub);
      continue;
    }

    const headKey = resolveRelationName(head, relations);

    // Only expand when the head is a real relation; otherwise leave it alone so
    // validation reports it clearly rather than the coercer inventing structure.
    if (headKey) {
      const relation = relations[headKey];
      // A to-many relation needs `some` — Prisma rejects a bare nested object there.
      const isList = Boolean((relation as any)?.isList) || /s$/i.test(headKey);
      const leaf = rest.reduceRight<any>((acc, part) => ({ [part]: acc }), value);
      const inner = isList ? { some: leaf } : leaf;

      expanded[headKey] = { ...(expanded[headKey] ?? {}), ...inner };
      notes.push({
        path: `${path}.${key}`,
        from: key,
        to: `${headKey}${isList ? '.some' : ''}.${rest.join('.')}`,
        reason: 'expanded dotted path into a nested relation filter',
      });
    } else {
      expanded[key] = value;
    }
  }
  filters = expanded;

  for (const [key, value] of Object.entries(filters)) {
    const lower = key.toLowerCase();
    const childPath = `${path}.${key}`;

    // Logical operators keep the current table scope.
    if (['and', 'or', 'not'].includes(lower)) {
      out[key] = Array.isArray(value)
        ? value.map(v => coerceFilters(table, v, notes, childPath, depth + 1).filters)
        : coerceFilters(table, value, notes, childPath, depth + 1).filters;
      continue;
    }

    // Descend through a relation into the target table's scope.
    const relation = relations[key] ?? relations[lower];
    if (relation && value && typeof value === 'object') {
      const target = relation.model;
      const targetCols = SCHEMA_REGISTRY.tables[target]?.columns ?? {};

      // `name` on a model that stores it as firstName/lastName, or that reaches a
      // person only through a further relation.
      const inner = value as Record<string, any>;
      if ('name' in inner && !('name' in targetCols)) {
        const rest = { ...inner };
        delete rest.name;

        let expanded: any = null;

        if ('firstName' in targetCols) {
          // Target is the person: User.firstName / User.lastName.
          expanded = expandNameFilter(inner.name);
        } else {
          // Target is a profile that has no name of its own — EmployeeProfile keeps
          // the person on `user`. Observed live: the model wrote
          // `{ employeeProfile: { name: 'sara' } }`, which failed validation and
          // surfaced a raw schema error to the user.
          const personRel = Object.entries(
            SCHEMA_RELATION_REGISTRY[target]?.relations ?? {}
          ).find(([relName, rel]) =>
            relName.toLowerCase() === 'user' ||
            (SCHEMA_REGISTRY.tables[(rel as any).model]?.columns ?? {}).hasOwnProperty('firstName')
          );

          if (personRel) {
            const nameFilter = expandNameFilter(inner.name);
            if (nameFilter) expanded = { [personRel[0]]: nameFilter };
          }
        }

        if (expanded) {
          notes.push({
            path: `${childPath}.name`,
            from: inner.name,
            to: expanded,
            reason: `${target} has no "name" column; matched the person's firstName/lastName instead`,
          });
          const merged = Object.keys(rest).length ? { AND: [rest, expanded] } : expanded;
          out[key] = coerceFilters(target, merged, notes, childPath, depth + 1).filters;
          continue;
        }
      }

      out[key] = coerceFilters(target, value, notes, childPath, depth + 1).filters;
      continue;
    }

    // Same aliasing at the current level (e.g. filtering user directly).
    if (lower === 'name' && !('name' in columns) && 'firstname' in Object.keys(columns).reduce((a, c) => ({ ...a, [c.toLowerCase()]: 1 }), {} as any)) {
      const expanded = expandNameFilter(value);
      if (expanded) {
        notes.push({
          path: childPath,
          from: value,
          to: expanded,
          reason: `${tableKey} has no "name" column; expanded to firstName/lastName match`,
        });
        Object.assign(out, expanded);
        continue;
      }
    }

    // Enum coercion.
    const allowed = getEnumValues(tableKey, key);
    if (allowed && allowed.length > 0) {
      const rawValue = typeof value === 'string'
        ? value
        : (value && typeof value === 'object' && typeof (value as any).equals === 'string')
          ? (value as any).equals
          : null;

      if (typeof rawValue === 'string') {
        const coerced = coerceEnumValue(rawValue, allowed);

        if (coerced === null) {
          // Dropping beats querying for a value that cannot exist: a superset lets
          // the answer say "1 of 7 is pending", whereas an impossible filter yields
          // zero rows and the assistant reports "there are none".
          notes.push({
            path: childPath,
            from: rawValue,
            to: undefined,
            reason: `"${rawValue}" is not a valid ${key} (allowed: ${allowed.join(', ')}). Filter dropped to avoid a false empty result.`,
          });
          continue;
        }

        if (coerced !== rawValue) {
          notes.push({
            path: childPath,
            from: rawValue,
            to: coerced,
            reason: `coerced to a valid ${key}`,
          });
        }

        out[key] = Array.isArray(coerced) ? { in: coerced } : coerced;
        continue;
      }
    }

    out[key] = value;
  }

  return { filters: out, notes };
}

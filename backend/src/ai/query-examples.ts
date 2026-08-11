/**
 * Verified question -> query-plan pairs, injected into the NL-to-SQL prompt.
 *
 * Few-shot examples are the single highest-leverage accuracy lever for text-to-SQL:
 * a mid-size model shown five structurally similar solved cases makes far fewer
 * schema and shape mistakes than the same model given only a schema dump. They also
 * encode the conventions this codebase expects (lowercase table keys, `operation`
 * values, how relations are traversed) which no schema description conveys.
 *
 * Adding examples is the intended way to fix a recurring wrong answer. Keep them
 * VERIFIED — a wrong example actively teaches the wrong pattern.
 *
 * Retrieval is lexical (see selectExamples): no embedding call, so this costs
 * nothing at request time.
 */

export interface QueryExample {
  /** The natural-language question, as a user would type it. */
  question: string;
  /** Extra phrasings that should retrieve this example (incl. Roman Urdu). */
  aliases?: string[];
  /** The correct plan. Must be valid against SCHEMA_REGISTRY. */
  plan: Record<string, any>;
  /** Why this shape is correct — kept out of the prompt, for maintainers. */
  note?: string;
}

export const QUERY_EXAMPLES: QueryExample[] = [
  // --- Simple counts -------------------------------------------------------
  {
    question: 'how many properties do we have?',
    aliases: ['total properties', 'kitni properties hain', 'property count', 'number of listings'],
    plan: { operation: 'aggregate', entities: ['property'], filters: {}, take: 1 },
    note: 'Pure count: no filters, aggregate operation. Do not add a status filter unless asked.',
  },
  {
    question: 'how many employees are there?',
    aliases: ['staff count', 'kitne employees hain', 'total staff', 'headcount'],
    plan: { operation: 'aggregate', entities: ['employeeprofile'], filters: {}, take: 1 },
  },

  // --- Filtered lists ------------------------------------------------------
  {
    question: 'show me properties in Dubai Marina',
    aliases: ['marina properties', 'dubai marina mein properties', 'listings in marina'],
    plan: {
      operation: 'fetch',
      entities: ['property'],
      filters: { location: { contains: 'Dubai Marina', mode: 'insensitive' } },
      take: 50,
    },
    note: 'Location is free text — always use contains + insensitive, never equals.',
  },
  {
    question: 'show available 2 bedroom apartments under 1 million',
    aliases: ['2 bed apartments', '2 bedroom flats under 1m'],
    plan: {
      operation: 'fetch',
      entities: ['property'],
      filters: {
        bedrooms: 2,
        type: 'APARTMENT',
        status: 'AVAILABLE',
        price: { lte: 1000000 },
      },
      take: 50,
    },
    note: 'Enum columns (type, status) use exact uppercase values from the schema.',
  },
  {
    question: 'list all leads',
    aliases: ['show leads', 'saare leads dikhao', 'all prospects'],
    plan: { operation: 'fetch', entities: ['lead'], filters: {}, take: 50 },
    note: 'Generic nouns produce no filters. "leads" is not a filter value.',
  },
  {
    question: 'show me new leads that are not assigned to anyone',
    aliases: ['unassigned leads', 'leads without agent'],
    plan: {
      operation: 'fetch',
      entities: ['lead'],
      filters: { status: 'NEW', assignedToId: null },
      take: 50,
    },
    note: 'Absence of a relation is `null` on the foreign key, not a nested filter.',
  },

  // --- Relations -----------------------------------------------------------
  {
    question: 'which properties does owner Ahmed have?',
    aliases: ['ahmed ki properties', 'properties owned by Ahmed'],
    plan: {
      operation: 'fetch',
      entities: ['property'],
      filters: { owner: { name: { contains: 'Ahmed', mode: 'insensitive' } } },
      take: 50,
    },
    note: 'Traverse the relation by name (owner), not the foreign key (ownerId).',
  },
  {
    question: 'show tasks assigned to Sarah',
    aliases: ['sarah ke tasks', 'sarah task list'],
    plan: {
      operation: 'fetch',
      entities: ['task'],
      filters: { assignedTo: { firstName: { contains: 'Sarah', mode: 'insensitive' } } },
      take: 50,
    },
    note: 'Person names live on the related user, split across firstName/lastName.',
  },

  // --- Dates ---------------------------------------------------------------
  {
    question: 'show attendance for this month',
    aliases: ['is mahine ki attendance', 'monthly attendance', 'attendance record'],
    plan: {
      operation: 'fetch',
      entities: ['attendance'],
      // Attendance dates live in `dateStr` as 'YYYY-MM-DD' strings, NOT a `date`
      // timestamp column. String comparison works because the format sorts
      // lexicographically.
      filters: { dateStr: { gte: '2026-07-01', lte: '2026-07-31' } },
      take: 100,
    },
    note: 'Column is dateStr (YYYY-MM-DD string), not date. Resolve the month to concrete bounds.',
  },
  {
    question: 'who was absent yesterday?',
    aliases: ['kal kon absent tha', 'absentees', 'yesterday absent list'],
    plan: {
      operation: 'fetch',
      entities: ['attendance'],
      filters: { dateStr: '2026-07-29', status: 'ABSENT' },
      take: 100,
    },
    note: 'Exact-day lookups compare dateStr for equality, not a range.',
  },
  {
    question: 'show attendance for employee Aizaz',
    aliases: ['aizaz ki attendance', 'attendance of Aizaz'],
    plan: {
      operation: 'fetch',
      entities: ['attendance'],
      // User has firstName/lastName and NO `name` column, so a person's name must be
      // matched as an OR across both. The old hand-written schema registry documented
      // `{ user: { name: ... } }` in three places — that throws
      // "Unknown argument `name`" in Prisma, so every "attendance for <person>" query
      // was being generated invalid.
      filters: {
        employeeProfile: {
          user: {
            OR: [
              { firstName: { contains: 'Aizaz', mode: 'insensitive' } },
              { lastName: { contains: 'Aizaz', mode: 'insensitive' } },
            ],
          },
        },
      },
      take: 100,
    },
    note: 'Two relations deep: attendance -> employeeProfile -> user. Name is firstName/lastName, never `name`.',
  },
  {
    question: 'which leave requests are pending approval?',
    aliases: ['pending leaves', 'chutti requests', 'leave approvals'],
    plan: {
      operation: 'fetch',
      entities: ['leaverequest'],
      filters: { status: 'PENDING' },
      take: 50,
    },
    note: 'Leave lives in leaverequest — never infer it from employeeprofile.',
  },

  // --- Aggregates with grouping -------------------------------------------
  {
    question: 'what is the average property price by location?',
    aliases: ['average price per area', 'price by location'],
    plan: {
      operation: 'aggregate',
      entities: ['property'],
      filters: {},
      groupBy: ['location'],
      metrics: ['price'],
      take: 50,
    },
    note: 'groupBy holds the dimension; metrics holds the numeric column.',
  },
  {
    question: 'total payroll cost this month',
    aliases: ['salary total', 'payroll expense', 'kitni tankhwa'],
    plan: {
      operation: 'aggregate',
      entities: ['payroll'],
      filters: {},
      metrics: ['netSalary'],
      take: 1,
    },
  },
];

/**
 * Picks the examples most likely to help with `query`.
 *
 * Scored on term overlap plus a bonus when an example targets a table the planner
 * already selected — a same-table example teaches the right column names, which is
 * where most generated plans go wrong.
 */
export function selectExamples(
  query: string,
  targetEntities: string[] = [],
  limit = 4
): QueryExample[] {
  const stop = new Set([
    'the', 'a', 'an', 'is', 'are', 'of', 'for', 'to', 'in', 'on', 'and', 'or',
    'show', 'me', 'all', 'list', 'give', 'get', 'find', 'what', 'how', 'many',
    'do', 'we', 'have', 'there', 'ka', 'ki', 'ke', 'ko', 'hai', 'hain', 'mein',
    'dikhao', 'batao', 'kitne', 'kitni', 'kitna', 'saare', 'sab',
  ]);

  const terms = new Set(
    query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 2 && !stop.has(t))
  );
  const entities = new Set(targetEntities.map(e => e.toLowerCase()));

  const scored = QUERY_EXAMPLES.map(ex => {
    const haystack = [ex.question, ...(ex.aliases || [])].join(' ').toLowerCase();
    let score = 0;

    for (const t of terms) {
      if (haystack.includes(t)) score += 2;
    }

    // Same-table examples are the most instructive, so weight them heavily.
    const exEntities: string[] = ex.plan.entities || [];
    if (exEntities.some(e => entities.has(String(e).toLowerCase()))) score += 5;

    return { ex, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.ex);
}

/** Renders selected examples as prompt text. Notes are omitted deliberately. */
export function renderExamples(examples: QueryExample[]): string {
  if (examples.length === 0) return '';
  return examples
    .map(ex => `User Query: "${ex.question}"\nPlan: ${JSON.stringify(ex.plan)}`)
    .join('\n\n');
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiLlmService } from './ai-llm.service';
import { selectExamples, renderExamples } from './query-examples';
import { TenantIsolationService } from './tenant-isolation.service';
import { PermissionService } from './permission.service';
import { coerceFilters, CoercionNote } from './filter-coercion';

export interface DatabasePipelineResult {
  rows: any[];
  verified: boolean;
  confidenceScore: number;
  tablesUsed: string[];
  queriesRun: string[];
  errors: string[];
  rawLlmResponse?: string;
  parseError?: string;
  generatedPlan?: any;
  validationResult?: any;
  /** Set when the original filters returned nothing and a broader retry succeeded. */
  broadened?: { droppedFilters: string[]; rowCount: number } | null;
  /** Human-readable notes about filters that were coerced or dropped. */
  filterRepairs?: string[];
}

// Layer 1: Schema Registry
//
// Moved out of this file into schema-registry.ts, which merges three sources:
//   - schema-dictionary.ts        (44 tables + natural-language synonyms)
//   - schema-meta.generated.ts    (parsed from prisma/schema.prisma: allowed values
//                                  for status/type columns, types, relation graph)
//   - curated per-column notes
//
// The previous inline copy covered 25 tables, had no synonyms, declared only 4
// relationships, and had to be hand-edited to stay in step with Prisma. Re-exported
// here so existing importers keep working unchanged.
export {
  SCHEMA_REGISTRY,
  SCHEMA_RELATION_REGISTRY,
  getEnumValues,
  resolveTableSynonym,
  buildTableCatalogue,
} from './schema-registry';

import {
  SCHEMA_REGISTRY,
  SCHEMA_RELATION_REGISTRY,
  getEnumValues,
} from './schema-registry';

@Injectable()
export class DatabasePipelineService {
  private readonly logger = new Logger(DatabasePipelineService.name);

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            )
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  mapRelationalFilters(entity: string, filters: any): any {
    if (!filters || typeof filters !== 'object') return filters;
    
    const entKey = entity.toLowerCase();
    const registry = SCHEMA_RELATION_REGISTRY[entKey];
    if (!registry) return filters;
    
    const mapped: any = {};
    for (const key of Object.keys(filters)) {
      const val = filters[key];
      let resolved = false;
      
      for (const relKey of Object.keys(registry.relations)) {
        const relConfig = registry.relations[relKey];
        if (relConfig.fields.includes(key)) {
          mapped[relKey] = mapped[relKey] || {};
          if (key === 'name') {
            mapped[relKey]['firstName'] = val;
          } else {
            mapped[relKey][key] = val;
          }
          resolved = true;
          break;
        }
      }
      
      if (!resolved) {
        mapped[key] = val;
      }
    }
    
    return mapped;
  }

  buildStageWhereClause(baseWhere: any, stage: number): any {
    const where = JSON.parse(JSON.stringify(baseWhere));
    
    const transformValue = (val: any, s: number, keyName?: string): any => {
      if (keyName && this.tenantIsolationService.isSecurityKey(keyName)) {
        return val; // Protect security key from wildcard conversions
      }
      if (typeof val === 'string') {
        if (s === 1) return val;
        if (s === 2) return { equals: val, mode: 'insensitive' };
        if (s === 3) return { contains: val, mode: 'insensitive' };
        if (s === 4) return { contains: val, mode: 'insensitive' };
      }
      if (typeof val === 'object' && val !== null) {
        // Skip operators like contains, mode, equals
        if (val.contains !== undefined || val.equals !== undefined) return val;
        const trans: any = {};
        for (const k of Object.keys(val)) {
          trans[k] = transformValue(val[k], s, k);
        }
        return trans;
      }
      return val;
    };

    const transformed: any = {};
    for (const k of Object.keys(where)) {
      transformed[k] = transformValue(where[k], stage, k);
    }
    return transformed;
  }


  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService,
    private tenantIsolationService: TenantIsolationService,
    private permissionService: PermissionService
  ) {}

  // Layer 2: Semantic Mapping Engine
  semanticMapping(query: string): { mappedEntities: string[]; mappedFilters: any } {
    const q = query.toLowerCase();
    const entities: string[] = [];
    const filters: any = {};

    if (q.includes('revenue') || q.includes('salary') || q.includes('paisa') || q.includes('payroll')) {
      entities.push('payroll');
    }
    if (q.includes('property') || q.includes('listing') || q.includes('apartment') || q.includes('villa') || q.includes('rent') || q.includes('sale')) {
      entities.push('property');
    }
    if (q.includes('employee') || q.includes('staff') || q.includes('agent') || q.includes('designation')) {
      entities.push('employeeprofile');
    }
    if (q.includes('attendance') || q.includes('hazri') || q.includes('late') || q.includes('absent') || q.includes('present')) {
      entities.push('attendance');
    }
    if (q.includes('task') || q.includes('todo') || q.includes('checklist')) {
      entities.push('task');
    }
    if (q.includes('lead')) {
      entities.push('lead');
    }
    if (q.includes('client') || q.includes('buyer') || q.includes('investor') || q.includes('budget')) {
      entities.push('client');
    }
    if (q.includes('leave') || q.includes('chutti') || q.includes('vacation')) {
      entities.push('leaverequest');
    }
    if (q.includes('vehicle') || q.includes('gari') || q.includes('car')) {
      entities.push('vehicle');
    }
    if (q.includes('maintenance') || q.includes('repair') || q.includes('kharcha')) {
      entities.push('vehiclemaintenance');
    }
    if (q.includes('logistics') || q.includes('delivery') || q.includes('route') || q.includes('schedule')) {
      entities.push('logisticsschedule');
    }
    if (q.includes('owner') || q.includes('landlord') || q.includes('malik')) {
      entities.push('owner');
    }
    if (q.includes('viewing') || q.includes('visit') || q.includes('dikhana')) {
      entities.push('clientviewing');
    }
    if (q.includes('interest') || q.includes('like') || q.includes('pasand')) {
      entities.push('clientpropertyinterest');
    }
    if (q.includes('activity') || q.includes('lead timeline')) {
      entities.push('leadactivity');
    }
    if (q.includes('event') || q.includes('meeting') || q.includes('calendar')) {
      entities.push('calendarevent');
    }
    if (q.includes('key') || q.includes('chabi')) {
      entities.push('keytracker');
    }
    if (q.includes('checkout') || q.includes('return')) {
      entities.push('keycheckout');
    }
    if (q.includes('employee document') || q.includes('staff file') || q.includes('resume') || q.includes('cv') || q.includes('passport') || q.includes('visa')) {
      entities.push('employeedocument');
    }
    if (q.includes('performance') || q.includes('appraisal') || q.includes('rating') || q.includes('review')) {
      entities.push('performancereview');
    }
    if (q.includes('price history') || q.includes('past price') || q.includes('price change')) {
      entities.push('propertypricehistory');
    }
    if (q.includes('owner document') || q.includes('landlord file') || q.includes('owner paper')) {
      entities.push('ownerdocument');
    }
    if (q.includes('owner call') || q.includes('owner email') || q.includes('owner communication') || q.includes('owner chat')) {
      entities.push('ownercommunication');
    }
    if (q.includes('client call') || q.includes('client email') || q.includes('client communication') || q.includes('client chat')) {
      entities.push('clientcommunication');
    }
    if (q.includes('driver') || q.includes('license')) {
      entities.push('driverprofile');
    }

    if (entities.length === 0) {
      entities.push('property'); // Safe default
    }

    return {
      mappedEntities: entities,
      mappedFilters: filters
    };
  }

  // Layer 3: Natural Language to SQL/Query Engine
  async generateQueryPlan(
    queryText: string,
    mappedEntities: string[],
    organizationId: string,
    userId: string,
    userRole: string
  ): Promise<any> {
    this.logger.log(`[Layer 3: NL-to-SQL Engine] Translating: "${queryText}"`);

    const schemaSub = {};
    for (const ent of mappedEntities) {
      if (SCHEMA_REGISTRY.tables[ent]) {
        schemaSub[ent] = SCHEMA_REGISTRY.tables[ent];
      }
    }

    // Few-shot examples. A schema dump alone tells the model what columns exist but
    // not what a correct plan looks like for this codebase — so it invents shapes.
    // Worked examples from the same tables fix most of that, and selection here is
    // lexical, so it adds no latency.
    const examples = selectExamples(queryText, mappedEntities, 4);
    const exampleBlock = examples.length > 0
      ? `\n=== VERIFIED EXAMPLES (follow these shapes exactly) ===\n${renderExamples(examples)}\n`
      : '';

    const nlsPrompt = `You are the Zorvex AI V9 NL-to-SQL & Query Plan Generator (Layer 3).
Convert the user request query step into a structured database query plan parameters object for Prisma.

=== CURRENT DATE ===
Today is ${new Date().toISOString().slice(0, 10)}. Resolve every relative date range
("this month", "last week", "is mahine") into concrete ISO date strings.

User Query: "${queryText}"
Target Models: ${JSON.stringify(mappedEntities)}
Schema Registry:
${JSON.stringify(schemaSub, null, 2)}
${exampleBlock}
Instructions:
1. Translate the user query into valid filters, groupby, metrics, and operation options.
2. The plan must output parameters matching this format:
{
  "operation": "fetch | aggregate | compare | analyze",
  "entities": ["property" | "employeeprofile" | "attendance" | "payroll" | "task" | "lead" | "client"],
  "filters": {
     // Standard Prisma where clause representation, resolving dates and location variables
     // Resolve location phonetics (e.g. "marina" to "Dubai Marina", "downtown" to "Downtown Dubai")
  },
  "groupBy": ["field1", ...], // Optional array
  "metrics": ["field1", ...], // Optional array for aggregates (e.g. netSalary, baseSalary, price, budget)
  "take": 50
}
3. DO NOT CREATE FILTERS FOR GENERIC NOUNS: Do not add search or equality filters for generic nouns like "employee", "client", "tenant", "landlord", "owner", or "property" (e.g., trying to filter employee name by "employee") unless the user explicitly specifies a real name (like "Sarah"), location, status, or specific ID. Keep the filters empty or focused only on active status/dates for general questions.

Return ONLY raw JSON matching the format. Do not include markdown code block tags.`;

    let resText = '';
    try {
      resText = await this.llmService.callLLM(
        nlsPrompt,
        `Generate query parameters`,
        [],
        false,
        organizationId,
        userId
      );
      const cleanJson = resText.trim();
      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        let rawJson = cleanJson.substring(jsonStart, jsonEnd + 1);
        // Strip single-line comments (//...)
        rawJson = rawJson.replace(/\/\/.*$/gm, '');
        // Strip multi-line comments (/*...*/)
        rawJson = rawJson.replace(/\/\*[\s\S]*?\*\//g, '');
        const parsed = JSON.parse(rawJson);
        return {
          ...parsed,
          _rawLlmResponse: resText,
          _parseError: null
        };
      } else {
        throw new Error('No JSON object boundaries found in response.');
      }
    } catch (e) {
      this.logger.warn(`NL-to-SQL engine parsing failed: ${e.message}`);
      return {
        operation: 'fetch',
        entities: mappedEntities,
        filters: {},
        take: 20,
        _rawLlmResponse: resText,
        _parseError: e.message
      };
    }
  }

  // Layer 4 & 5: SQL Validation Engine & Query Optimization Engine
  validateAndOptimizeQuery(queryPlan: any, userRole: string): { isValid: boolean; errorMsg?: string; optimizedPlan: any } {
    this.logger.log(`[Layer 4 & 5: Validation & Optimization] Validating Prisma query plan parameters`);

    if (!queryPlan || !Array.isArray(queryPlan.entities)) {
      return {
        isValid: false,
        errorMsg: 'Malformed Query Plan: No entities defined.',
        optimizedPlan: null
      };
    }

    // Auto-correct / normalize entity keys
    const correctedEntities: string[] = [];
    const validTables = Object.keys(SCHEMA_REGISTRY.tables); // lowercase keys

    for (const ent of queryPlan.entities) {
      if (typeof ent !== 'string') continue;
      const cleanEnt = ent.toLowerCase().replace(/_/g, '').replace(/-/g, '').trim();
      
      if (validTables.includes(cleanEnt)) {
        correctedEntities.push(cleanEnt);
      } else {
        // Advanced smart correction mapping for close variations
        let matched = false;
        for (const tbl of validTables) {
          if (tbl.includes(cleanEnt) || cleanEnt.includes(tbl)) {
            correctedEntities.push(tbl);
            matched = true;
            break;
          }
        }
        if (!matched) {
          correctedEntities.push(cleanEnt);
        }
      }
    }

    const optimized = { ...queryPlan, entities: correctedEntities };

    // Table-level access, from permission-registry.ts.
    //
    // This replaces two hardcoded role arrays that covered only 'payroll' and the
    // three logistics tables — every other table was readable by any role that
    // reached this point. The registry covers all 44 tables and fails closed on an
    // unrecognised role.
    const access = this.permissionService.checkTables(userRole, optimized.entities);
    if (!access.allowed) {
      return {
        isValid: false,
        errorMsg: `Clearance Required: ${access.reason}`,
        optimizedPlan: null
      };
    }

    // Block modifications - only read queries allowed
    if (optimized.operation === 'delete' || optimized.operation === 'update' || optimized.operation === 'create') {
      return {
        isValid: false,
        errorMsg: 'Security Violation: Database retrieval pipeline is strictly READ ONLY. Alter/Delete statements blocked.',
        optimizedPlan: null
      };
    }

    // Normalize custom operations to default fetch (except aggregate) to prevent crashes
    if (optimized.operation !== 'aggregate') {
      optimized.operation = 'fetch';
    }

    // Optimization step
    if (!optimized.take) {
      optimized.take = 25; // Limit scan sizes
    }
    optimized.take = Math.min(optimized.take, 100); // Caps scanning to avoid memory bloat

    return {
      isValid: true,
      optimizedPlan: optimized
    };
  }

  // Layer 6: Database Execution Engine
  async executeDatabaseQuery(
    optimizedPlan: any,
    organizationId: string,
    userId: string,
    userRole: string
  ): Promise<any[]> {
    this.logger.log(`[Layer 6: Database Execution] Running query against NeonDB: ${JSON.stringify(optimizedPlan)}`);

    const results: any[] = [];
    const modelMap: Record<string, string> = {
      organization: 'organization',
      user: 'user',
      employeeprofile: 'employeeProfile',
      employeedocument: 'employeeDocument',
      attendance: 'attendance',
      leaverequest: 'leaveRequest',
      activitylog: 'activityLog',
      performancereview: 'performanceReview',
      property: 'property',
      lead: 'lead',
      client: 'client',
      task: 'task',
      owner: 'owner',
      ownercommunication: 'ownerCommunication',
      ownerdocument: 'ownerDocument',
      clientpropertyinterest: 'clientPropertyInterest',
      clientviewing: 'clientViewing',
      clientcommunication: 'clientCommunication',
      payroll: 'payroll',
      propertypricehistory: 'propertyPriceHistory',
      document: 'document',
      documentversion: 'documentVersion',
      driverprofile: 'driverProfile',
      vehicle: 'vehicle',
      vehiclemaintenance: 'vehicleMaintenance',
      logisticsschedule: 'logisticsSchedule',
      keytracker: 'keyTracker',
      keycheckout: 'keyCheckout',
      leadactivity: 'leadActivity',
      chatroom: 'chatRoom',
      message: 'message',
      calendarevent: 'calendarEvent',
      aidocument: 'aiDocument',
      aidocumentchunk: 'aiDocumentChunk',
      aichatsession: 'aiChatSession',
      integrationconfig: 'integrationConfig',
      communicationtemplate: 'communicationTemplate',
      integrationlog: 'integrationLog',
      aimemoryvector: 'aiMemoryVector',
      subscription: 'subscription',
      subscriptionpayment: 'subscriptionPayment',
      apiusagelog: 'apiUsageLog'
    };

    // Deep date resolver helper
    const resolveDateStrings = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'string') {
        // Handle full ISO 8601 datetime strings: "2025-01-15T00:00:00.000Z"
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
        if (isoDateRegex.test(obj)) {
          const date = new Date(obj);
          if (!isNaN(date.getTime())) return date;
        }
        // Handle plain date strings: "2025-01-15" (LLM planner often returns this format)
        const plainDateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (plainDateRegex.test(obj)) {
          const date = new Date(obj + 'T00:00:00.000Z');
          if (!isNaN(date.getTime())) return date;
        }
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(item => resolveDateStrings(item));
      if (typeof obj === 'object') {
        const resObj: any = {};
        for (const k of Object.keys(obj)) {
          resObj[k] = resolveDateStrings(obj[k]);
        }
        return resObj;
      }
      return obj;
    };

    const cleanFilters = resolveDateStrings(optimizedPlan.filters || {});

    for (const ent of optimizedPlan.entities) {
      const modelKey = modelMap[ent.toLowerCase()];
      if (!modelKey) continue;

      const model = this.prisma[modelKey];
      const rawWhereClause = this.tenantIsolationService.injectTenantFilter(ent, cleanFilters, organizationId);

      // Row-level scoping from permission-registry.ts.
      //
      // Was a hardcoded AGENT check covering lead/task/client. It also assigned
      // `rawWhereClause.assignedToId = userId` directly, overwriting any existing
      // condition on that field — the registry version ANDs instead, so a filter can
      // never widen the scope.
      const scopedWhere = this.permissionService.applyRowLevelSecurity(
        userRole, ent, rawWhereClause, userId
      );

      // Filter sanitization to prevent Prisma crashes on invalid schema properties (e.g. from raw planner custom operations)
      const whereClause: any = {};
      const schemaCols = SCHEMA_REGISTRY.tables[ent.toLowerCase()]?.columns;
      if (schemaCols) {
        // Relation names now come from the generated relation graph rather than a
        // hardcoded list of nine, which silently dropped any filter that traversed a
        // relation outside it.
        const relKeys = Object.keys(SCHEMA_RELATION_REGISTRY[ent.toLowerCase()]?.relations ?? {});
        const allAllowed = [
          ...Object.keys(schemaCols),
          'organizationId', 'assignedToId', 'userId', 'OR', 'AND', 'NOT',
          ...relKeys,
        ];
        for (const k of Object.keys(scopedWhere)) {
          if (allAllowed.includes(k)) {
            whereClause[k] = scopedWhere[k];
          }
        }
      } else {
        Object.assign(whereClause, scopedWhere);
      }

      try {
        if (optimizedPlan.operation === 'aggregate') {
          let rows: any[] = [];
          for (let stage = 1; stage <= 4; stage++) {
            const stageWhere = this.buildStageWhereClause(whereClause, stage);
            const aggArgs: any = {
              where: stageWhere,
              _count: true
            };
            if (optimizedPlan.metrics && optimizedPlan.metrics.length > 0) {
              aggArgs._sum = {};
              aggArgs._avg = {};
              const validNumericFields = [
                'price', 'bedrooms', 'bathrooms', 'areaSqft', 'salary', 
                'netSalary', 'baseSalary', 'allowances', 'deductions', 
                'cost', 'amount', 'rating', 'duration', 'progress'
              ];
              for (const m of optimizedPlan.metrics) {
                if (m === 'count') continue;
                if (!validNumericFields.includes(m)) continue;
                aggArgs._sum[m] = true;
                aggArgs._avg[m] = true;
              }
              if (Object.keys(aggArgs._sum).length === 0) {
                delete aggArgs._sum;
                delete aggArgs._avg;
              }
            }

            if (optimizedPlan.groupBy && optimizedPlan.groupBy.length > 0) {
              const groupByArgs = {
                by: optimizedPlan.groupBy,
                where: stageWhere,
                _count: true,
                ...(optimizedPlan.metrics && optimizedPlan.metrics.length > 0 ? {
                  _sum: aggArgs._sum,
                  _avg: aggArgs._avg
                } : {})
              };
              rows = await model.groupBy(groupByArgs).catch(() => []);
            } else {
              const aggResult = await model.aggregate(aggArgs).catch(() => null);
              rows = aggResult ? [aggResult] : [];
            }

            const countVal = rows[0]?._count;
            const hasResults = rows.length > 0 && (
              countVal === undefined || 
              (typeof countVal === 'number' && countVal > 0) ||
              (typeof countVal === 'object' && countVal !== null && Object.values(countVal).some((v: any) => v > 0))
            );

            if (hasResults) {
              this.logger.log(`[Multi-Stage Search Aggregate] Succeeded at Stage ${stage}`);
              break;
            }
          }
          results.push(...rows);
        } else {
          // Default: Fetch rows
          let includeOptions: any = undefined;
          const entLower = ent.toLowerCase();
          if (entLower === 'property') {
            includeOptions = { owner: { select: { name: true, phone: true } } };
          } else if (entLower === 'employeeprofile') {
            includeOptions = { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } };
          } else if (entLower === 'lead' || entLower === 'task') {
            includeOptions = { assignedTo: { select: { firstName: true, lastName: true, email: true } } };
          } else if (entLower === 'leaverequest') {
            includeOptions = { employeeProfile: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } };
          } else if (entLower === 'vehiclemaintenance') {
            includeOptions = { vehicle: { select: { modelName: true, plateNumber: true } } };
          } else if (entLower === 'logisticsschedule') {
            includeOptions = {
              driver: { include: { employeeProfile: { include: { user: { select: { firstName: true, lastName: true } } } } } },
              vehicle: { select: { modelName: true, plateNumber: true } }
            };
          } else if (entLower === 'clientviewing') {
            includeOptions = {
              client: { select: { name: true } },
              property: { select: { title: true } }
            };
          } else if (entLower === 'clientpropertyinterest') {
            includeOptions = {
              client: { select: { name: true } },
              property: { select: { title: true } }
            };
          } else if (entLower === 'leadactivity') {
            includeOptions = { lead: { select: { name: true } } };
          } else if (entLower === 'keytracker') {
            includeOptions = { property: { select: { title: true } } };
          } else if (entLower === 'keycheckout') {
            includeOptions = {
              key: { include: { property: { select: { title: true } } } },
              user: { select: { firstName: true, lastName: true } }
            };
          } else if (entLower === 'employeedocument') {
            includeOptions = { employeeProfile: { include: { user: { select: { firstName: true, lastName: true } } } } };
          } else if (entLower === 'performancereview') {
            includeOptions = {
              employeeProfile: { include: { user: { select: { firstName: true, lastName: true } } } },
              reviewedBy: { select: { firstName: true, lastName: true } }
            };
          } else if (entLower === 'propertypricehistory') {
            includeOptions = { property: { select: { title: true } } };
          } else if (entLower === 'ownerdocument') {
            includeOptions = { owner: { select: { name: true } } };
          } else if (entLower === 'ownercommunication') {
            includeOptions = { owner: { select: { name: true } } };
          } else if (entLower === 'clientcommunication') {
            includeOptions = { client: { select: { name: true } } };
          } else if (entLower === 'driverprofile') {
            includeOptions = { employeeProfile: { include: { user: { select: { firstName: true, lastName: true } } } } };
          }

          let rows: any[] = [];
          for (let stage = 1; stage <= 4; stage++) {
            if (stage === 4) {
              // Fuzzy matching via local Levenshtein filtering for string values
              const searchStr = (cleanFilters.location || cleanFilters.name || cleanFilters.firstName);
              if (searchStr && typeof searchStr === 'string') {
                try {
                  // Stage 4: full-table scan capped at 500 rows to prevent memory overload
                  const allRecords = await model.findMany({
                    where: this.tenantIsolationService.injectTenantFilter(ent, {}, organizationId),
                    include: includeOptions,
                    take: 500  // Safety cap — avoids full table scan on large datasets
                  });
                  const cleanSearch = searchStr.toLowerCase().trim();
                  rows = allRecords.filter((rec: any) => {
                    const loc = (rec.location || '').toLowerCase();
                    const fName = (rec.user?.firstName || rec.firstName || rec.name || '').toLowerCase();
                    return loc.includes(cleanSearch) || cleanSearch.includes(loc) ||
                           fName.includes(cleanSearch) || cleanSearch.includes(fName) ||
                           (loc.length > 2 && this.levenshtein(loc, cleanSearch) <= 3) ||
                           (fName.length > 2 && this.levenshtein(fName, cleanSearch) <= 3);
                  }).slice(0, optimizedPlan.take);
                  if (rows.length > 0) {
                    this.logger.log(`[Multi-Stage Search Fetch] Succeeded at Stage 4 (Fuzzy local match)`);
                    break;
                  }
                } catch (e) {
                  this.logger.warn(`Stage 4 fuzzy match local failed: ${e.message}`);
                }
              }
            }

            const stageWhere = this.buildStageWhereClause(whereClause, stage);
            rows = await model.findMany({
              where: stageWhere,
              include: includeOptions,
              take: optimizedPlan.take,
              orderBy: { createdAt: 'desc' } as any
            }).catch(async () => {
              return await model.findMany({
                where: stageWhere,
                include: includeOptions,
                take: optimizedPlan.take
              }).catch(() => []);
            });

            if (rows.length > 0) {
              this.logger.log(`[Multi-Stage Search Fetch] Succeeded at Stage ${stage}`);
              break;
            }
          }

          // Column redaction from permission-registry.ts.
          //
          // The old rule was a shallow `salary` mask on employeeprofile only, applied
          // to top-level rows. It missed the case that matters: `salary` arriving
          // through a relation (attendance/payroll -> employeeProfile.salary), where
          // it was returned in full to any role that could read the parent table. It
          // also had no notion of passwordHash, which was reachable through the
          // `user` relation. redactRows walks nested objects, so both are covered.
          //
          // Own-record exemption is preserved: you can always see your own salary.
          const restricted = this.permissionService.getRestrictedColumns(userRole, ent);
          if (restricted.length > 0) {
            const ownRows: any[] = [];
            const otherRows: any[] = [];
            for (const row of rows) {
              // employeeprofile.userId identifies whose record this is.
              (row?.userId && row.userId === userId ? ownRows : otherRows).push(row);
            }
            results.push(
              ...ownRows,
              ...this.permissionService.redactRows(userRole, ent, otherRows)
            );
          } else {
            results.push(...rows);
          }
        }
      } catch (err) {
        // Re-throw ForbiddenException — must not swallow auth violations as empty results
        if (err?.constructor?.name === 'ForbiddenException' || err?.status === 403) {
          throw err;
        }
        this.logger.error(`Postgres execution error on model ${modelKey}: ${err.message}`);
      }
    }

    return results;
  }

  // Layer 7: Result Verification Engine
  verifyResults(rows: any[]): { isVerified: boolean; businessError?: string } {
    this.logger.log(`[Layer 7: Result Verification] Verifying results for business rule violations`);

    for (const r of rows) {
      if (!r) continue;
      // 1. Negative numbers rule (e.g. salaries, prices, commissions cannot be negative)
      if (r.salary !== undefined && typeof r.salary === 'number' && r.salary < 0) {
        return { isVerified: false, businessError: 'Negative salary detected: violates business accounting bounds.' };
      }
      if (r.price !== undefined && typeof r.price === 'number' && r.price < 0) {
        return { isVerified: false, businessError: 'Negative listing price detected: violates business bounds.' };
      }
      if (r.netSalary !== undefined && typeof r.netSalary === 'number' && r.netSalary < 0) {
        return { isVerified: false, businessError: 'Negative Net Salary detected: payroll anomaly.' };
      }
      if (r.budget !== undefined && typeof r.budget === 'number' && r.budget < 0) {
        return { isVerified: false, businessError: 'Negative client budget detected: violates CRM rules.' };
      }
    }

    return { isVerified: true };
  }

  // Layer 8: SQL Confidence Engine
  calculateSQLConfidence(
    queryText: string,
    plan: any,
    rows: any[],
    isValid: boolean,
    isVerified: boolean
  ): number {
    this.logger.log(`[Layer 8: SQL Confidence Engine] Calculating retrieval confidence`);
    if (!isValid) return 0;

    let confidence = 100;

    // Deduct if verification failed
    if (!isVerified) confidence -= 30;

    // Deduct for empty records
    if (!rows || rows.length === 0) {
      confidence -= 15;
    }

    // Deduct for planning complexity
    if (plan.entities && plan.entities.length > 1) {
      confidence -= 5; // Multi-join queries have slightly lower certainty
    }

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Layer 4.5: schema validation of a generated query plan.
   *
   * This was an LLM call ("Strict Syntax & Security Reviewer") whose entire brief was
   * to confirm that the tables named in `entities` exist and the fields used in
   * `filters` / `groupBy` / `metrics` are real columns on those tables. That is a set
   * membership test against SCHEMA_REGISTRY — no judgement involved — so it ran here
   * in microseconds instead of a network round trip.
   *
   * It also removes a correctness trap: on a parse failure the old critic returned
   * `{ isValid: true }`, so a flaky model silently waved bad plans through.
   *
   * Returns a precise errorMsg naming the offending field and suggesting the closest
   * real column, which is what the repair step needs to fix it in one shot.
   */
  /**
   * Rewrites SQL-flavoured artefacts in a generated plan into the shape this
   * pipeline expects, before validation runs.
   *
   * Models naturally reach for SQL when asked to express a query, so they emit
   * `metrics: ["count(id)"]` or `["SUM(price)"]` even when shown counter-examples.
   * Rejecting that and burning a repair call is worse than just translating it:
   * the intent is unambiguous.
   *
   * `count(...)` is dropped entirely — with `operation: 'aggregate'` the row count
   * is what the executor already returns, so a metrics entry for it is redundant.
   */
  normalizeGeneratedPlan(planParams: any): any {
    if (!planParams || typeof planParams !== 'object') return planParams;

    const unwrap = (raw: any): string | null => {
      const s = String(raw ?? '').trim();
      if (!s) return null;

      const fn = /^(count|sum|avg|average|min|max|total)\s*\(\s*([^)]*)\s*\)$/i.exec(s);
      if (!fn) return s;

      const [, func, inner] = fn;
      const arg = inner.trim().replace(/^["'`]|["'`]$/g, '');

      // COUNT(*) / COUNT(id) carry no column information worth keeping.
      if (/^count$/i.test(func)) return null;
      if (!arg || arg === '*') return null;

      return arg;
    };

    const normalizeList = (value: any): string[] | undefined => {
      if (!value) return undefined;
      const list = Array.isArray(value) ? value : [value];
      const out = list
        .map(item => unwrap(typeof item === 'string' ? item : item?.field))
        .filter((v): v is string => Boolean(v));
      return out.length ? Array.from(new Set(out)) : undefined;
    };

    const normalized = { ...planParams };

    const metrics = normalizeList(planParams.metrics);
    if (metrics) normalized.metrics = metrics;
    else delete normalized.metrics;

    const groupBy = normalizeList(planParams.groupBy);
    if (groupBy) normalized.groupBy = groupBy;
    else delete normalized.groupBy;

    // A count-shaped request with nothing left to aggregate is still an aggregate.
    if (!normalized.metrics && /count/i.test(JSON.stringify(planParams.metrics ?? ''))) {
      normalized.operation = 'aggregate';
    }

    if (Array.isArray(normalized.entities)) {
      normalized.entities = normalized.entities.map((e: any) => String(e).toLowerCase().trim());
    }

    return normalized;
  }

  validateQueryPlanAgainstSchema(
    planParams: any
  ): { isValid: boolean; errorMsg?: string } {
    const problems: string[] = [];
    const entities: string[] = (planParams?.entities || []).map((e: any) => String(e).toLowerCase());

    if (entities.length === 0) {
      return { isValid: false, errorMsg: 'The query plan names no tables in "entities".' };
    }

    // 1. Every table must exist.
    const knownTables = Object.keys(SCHEMA_REGISTRY.tables);
    const validEntities: string[] = [];
    for (const ent of entities) {
      if (SCHEMA_REGISTRY.tables[ent]) {
        validEntities.push(ent);
      } else {
        const suggestion = this.closestMatch(ent, knownTables);
        problems.push(
          `Table "${ent}" does not exist.` +
          (suggestion ? ` Did you mean "${suggestion}"?` : ` Valid tables: ${knownTables.slice(0, 12).join(', ')}...`)
        );
      }
    }

    if (validEntities.length === 0) {
      return { isValid: false, errorMsg: problems.join(' ') };
    }

    // Field set for the selected tables, plus the relation graph so nested filters
    // can be validated against the table they actually traverse into.
    const { fields: allowedFields, relations: relationTargets } = this.describeTables(validEntities);

    // Prisma operators and structural keys are not column names.
    const structuralKeys = new Set([
      'and', 'or', 'not', 'some', 'every', 'none', 'is', 'isnot',
      'equals', 'in', 'notin', 'lt', 'lte', 'gt', 'gte', 'contains',
      'startswith', 'endswith', 'mode', 'search', 'has', 'hasevery',
      'hassome', 'isempty', 'select', 'include', 'where', 'orderby',
      'take', 'skip', 'distinct', '_count', '_sum', '_avg', '_min', '_max',
    ]);

    // Relation-aware descent.
    //
    // A filter like { employeeProfile: { user: { firstName: ... } } } is legitimate — the
    // schema documents it — but `user` is not a column on `attendance`. So when the
    // walk crosses a relation, the allowed-field set switches to the related table's
    // columns. Validating the whole nest against the root table's columns produced
    // false positives, and each one would have triggered a needless repair call.
    const checkFieldNames = (
      obj: any,
      path: string,
      fields: Set<string>,
      relations: Map<string, string>,
      depth = 0
    ) => {
      if (!obj || typeof obj !== 'object' || depth > 6) return;
      if (Array.isArray(obj)) {
        obj.forEach(o => checkFieldNames(o, path, fields, relations, depth + 1));
        return;
      }

      for (const key of Object.keys(obj)) {
        const lower = key.toLowerCase();

        // Prisma operators keep the current table context.
        if (structuralKeys.has(lower)) {
          checkFieldNames(obj[key], path, fields, relations, depth + 1);
          continue;
        }

        // Crossing a relation: re-scope to the target table.
        const target = relations.get(lower);
        if (target) {
          const scoped = this.describeTables([target]);
          checkFieldNames(obj[key], `${path}.${key}`, scoped.fields, scoped.relations, depth + 1);
          continue;
        }

        if (!fields.has(lower)) {
          const suggestion = this.closestMatch(lower, Array.from(fields));
          problems.push(
            `Field "${key}" in ${path} is not a column on [${validEntities.join(', ')}].` +
            (suggestion ? ` Closest real column is "${suggestion}".` : '')
          );
          continue;
        }

        checkFieldNames(obj[key], path, fields, relations, depth + 1);
      }
    };

    checkFieldNames(planParams.filters, 'filters', allowedFields, relationTargets);

    for (const key of ['groupBy', 'metrics'] as const) {
      const value = planParams?.[key];
      if (!value) continue;
      const list = Array.isArray(value) ? value : [value];
      for (const raw of list) {
        const field = String(typeof raw === 'string' ? raw : raw?.field || '').toLowerCase();
        if (!field || structuralKeys.has(field)) continue;
        if (!allowedFields.has(field)) {
          const suggestion = this.closestMatch(field, Array.from(allowedFields));
          problems.push(
            `Field "${field}" in ${key} is not a column on [${validEntities.join(', ')}].` +
            (suggestion ? ` Closest real column is "${suggestion}".` : '')
          );
        }
      }
    }

    if (problems.length > 0) {
      this.logger.warn(`[Schema Validation] ${problems.length} problem(s): ${problems.join(' | ')}`);
      return { isValid: false, errorMsg: problems.join(' ') };
    }

    return { isValid: true };
  }

  /**
   * Collects the valid field names for a set of tables, plus a map of
   * relationName -> targetTableKey so nested filters can be re-scoped.
   *
   * Relations are declared in two places, and both are honoured:
   *   - SCHEMA_RELATION_REGISTRY, which names the target model explicitly
   *   - column descriptions of the form "Relation to EmployeeProfile. ..." inside
   *     SCHEMA_REGISTRY, which is how attendance/payroll document their links
   */
  private describeTables(entities: string[]): { fields: Set<string>; relations: Map<string, string> } {
    const fields = new Set<string>();
    const relations = new Map<string, string>();
    const knownTables = Object.keys(SCHEMA_REGISTRY.tables);

    for (const ent of entities) {
      const def: any = SCHEMA_REGISTRY.tables[ent.toLowerCase()];
      if (!def) continue;

      for (const [colName, desc] of Object.entries(def.columns || {})) {
        const lower = colName.toLowerCase();
        fields.add(lower);

        // "Relation to EmployeeProfile. To search by ..." -> employeeprofile
        const match = /relation to ([a-z]+)/i.exec(String(desc));
        if (match) {
          const target = match[1].toLowerCase();
          if (knownTables.includes(target)) relations.set(lower, target);
        }
      }

      const relDef: any = (SCHEMA_RELATION_REGISTRY as any)[ent.toLowerCase()];
      for (const [relName, rel] of Object.entries<any>(relDef?.relations || {})) {
        const lower = relName.toLowerCase();
        fields.add(lower);
        const target = String(rel.model || '').toLowerCase();
        if (knownTables.includes(target)) {
          relations.set(lower, target);
        } else {
          // Target model is not in the registry (e.g. `user`), so its columns cannot
          // be enumerated. Accept the declared field list instead of rejecting.
          for (const f of (rel.fields || [])) fields.add(String(f).toLowerCase());
        }
      }
    }

    fields.delete('');
    return { fields, relations };
  }

  /** Nearest candidate by edit distance, for actionable error messages. */
  private closestMatch(needle: string, candidates: string[]): string | null {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const d = this.levenshtein(needle, c);
      if (d < bestScore) { bestScore = d; best = c; }
    }
    // Only suggest when it is plausibly a typo rather than a different concept.
    return best && bestScore <= Math.max(2, Math.floor(needle.length / 3)) ? best : null;
  }

  async repairQueryPlan(
    queryText: string,
    planParams: any,
    errorMsg: string,
    organizationId: string,
    userId: string
  ): Promise<any> {
    this.logger.log(`[Layer 4.5: LLM Pre-Execution Validation] Repairing query plan`);
    const schemaSub: any = {};
    for (const ent of (planParams.entities || [])) {
      if (SCHEMA_REGISTRY.tables[ent.toLowerCase()]) {
        schemaSub[ent.toLowerCase()] = SCHEMA_REGISTRY.tables[ent.toLowerCase()];
      }
    }
    
    const prompt = `You are the Zorvex AI V9 Planner Self-Healing Engine.
The previous Prisma Query Plan failed validation against the Schema Registry.
Error details from the Strict Syntax Reviewer:
"${errorMsg}"

Original User Query: "${queryText}"

Invalid Query Plan Parameters:
${JSON.stringify(planParams, null, 2)}

Available Schema:
${JSON.stringify(schemaSub, null, 2)}

Instructions:
1. Fix the invalid fields, filters, or entity names in the query plan so they exactly match the Available Schema.
2. Maintain the intent of the original query.
3. Return the fully repaired query plan parameters as raw JSON matching the structure:
{
  "operation": "fetch | aggregate | compare | analyze",
  "entities": [...],
  "filters": { ... },
  "groupBy": [...],
  "metrics": [...]
}
Do not use markdown blocks.`;

    try {
      const resText = await this.llmService.callLLM(prompt, "Repair Query", [], false, organizationId, userId);
      const cleanJson = resText.trim();
      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(cleanJson.substring(jsonStart, jsonEnd + 1));
      }
    } catch (e) {
      this.logger.warn(`LLM Pre-Execution Repair failed to parse: ${e.message}`);
    }
    return planParams; // Return original if repair fails parsing
  }

  // Entry Point: Run the entire Database Retrieval Pipeline
  async runDatabaseRetrievalPipeline(
    queryText: string,
    organizationId: string,
    userId: string,
    userRole: string,
    prePlannedNode?: any
  ): Promise<DatabasePipelineResult> {
    const errors: string[] = [];
    const queriesRun: string[] = [];

    let plan: any;
    if (prePlannedNode) {
      this.logger.log(`[Database Pipeline] Reusing pre-planned DAG node parameters. Bypassing NL-to-SQL LLM.`);
      plan = prePlannedNode;
    } else {
      // Layer 2: Semantic Mapping
      const mapping = this.semanticMapping(queryText);

      // Layer 3: NL-to-SQL
      plan = await this.generateQueryPlan(
        queryText,
        mapping.mappedEntities,
        organizationId,
        userId,
        userRole
      );
    }
    queriesRun.push(`Prisma Query Plan on [${plan.entities.join(', ')}]`);

    // Layer 4.5: schema validation + repair.
    //
    // Validation is deterministic and free, so it runs first and runs every time.
    // Only a genuine schema mismatch costs an LLM call, and then exactly one: the
    // old loop alternated LLM-validate and LLM-repair up to 5 calls deep, on a
    // check that never needed a model.
    // Translate SQL-flavoured output (count(id), SUM(price)) before judging it —
    // otherwise a perfectly clear intent costs a repair call.
    plan = this.normalizeGeneratedPlan(plan);

    // Repair filter values and aliased relation fields before validation.
    //
    // This is what stops the worst failure mode in the pipeline: a status value the
    // enum does not contain (`status: 'OPEN'` against PENDING/APPROVED/REJECTED)
    // returns zero rows, and zero rows is indistinguishable from truth downstream —
    // the assistant then states "there are no pending leave requests" while one sits
    // in the table.
    const coercionNotes: CoercionNote[] = [];

    const applyCoercion = (p: any) => {
      if (!p?.filters || !p.entities?.length) return p;
      const before = coercionNotes.length;
      const { filters: repaired } = coerceFilters(p.entities[0], p.filters, coercionNotes);
      p.filters = repaired;
      for (const note of coercionNotes.slice(before)) {
        this.logger.warn(`[Filter Repair] ${note.path}: ${JSON.stringify(note.from)} -> ${JSON.stringify(note.to)} (${note.reason})`);
        queriesRun.push(`[Filter Repair] ${note.reason}`);
      }
      return p;
    };

    plan = applyCoercion(plan);

    let criticValidation = this.validateQueryPlanAgainstSchema(plan);

    if (!criticValidation.isValid) {
      this.logger.warn(`[Schema Repair] Invalid plan: ${criticValidation.errorMsg}`);
      plan = this.normalizeGeneratedPlan(
        await this.repairQueryPlan(queryText, plan, criticValidation.errorMsg || 'Unknown schema error', organizationId, userId)
      );
      // The repaired plan needs the same treatment — it is fresh model output and
      // reintroduces the same aliases. Observed live: the repair re-emitted
      // `employeeProfile: { name: 'sara' }`, which then failed validation a second
      // time and surfaced a raw schema error to the user.
      plan = applyCoercion(plan);
      queriesRun.push(`[Schema Repair] Repaired Prisma Query Plan on [${plan.entities?.join(', ') || 'unknown'}]`);
      criticValidation = this.validateQueryPlanAgainstSchema(plan);
    }

    if (!criticValidation.isValid) {
      this.logger.error(`[Schema Repair] Plan still invalid after repair: ${criticValidation.errorMsg}`);
      errors.push(`AI Schema Validation Failed: ${criticValidation.errorMsg}`);
    }

    // Layer 4 & 5: SQL Validation & Optimization
    const validation = this.validateAndOptimizeQuery(plan, userRole);
    if (!validation.isValid) {
      errors.push(validation.errorMsg || 'Query validation failed.');
      return {
        rows: [],
        verified: false,
        confidenceScore: 0,
        tablesUsed: plan.entities,
        queriesRun,
        errors,
        rawLlmResponse: plan._rawLlmResponse,
        parseError: plan._parseError,
        generatedPlan: plan,
        validationResult: validation
      };
    }

    // Layer 6: Execution
    let rows = await this.executeDatabaseQuery(
      validation.optimizedPlan,
      organizationId,
      userId,
      userRole
    );

    // Layer 6.5: Agentic broadening.
    //
    // A zero-row result is ambiguous — it means either "no such record" or "my filter
    // was wrong" — and the assistant has no way to tell them apart, so it confidently
    // reports absence. That is how "are there open leave applications?" came back as
    // "there are no pending leave requests" while a PENDING request existed.
    //
    // So on an empty result we retry once with the narrowing filters removed, and
    // hand both outcomes to the composer: it can then say "nothing matched THAT, but
    // here is what exists" instead of asserting the record does not exist.
    let broadenedRows: any[] = [];
    let droppedFilters: string[] = [];

    if (rows.length === 0 && validation.optimizedPlan?.filters) {
      const narrowing = Object.keys(validation.optimizedPlan.filters).filter(
        k => !['organizationId', 'assignedToId', 'AND', 'OR', 'NOT'].includes(k)
      );

      if (narrowing.length > 0) {
        this.logger.log(`[Agentic Retry] 0 rows with filters [${narrowing.join(', ')}] — retrying broader.`);

        const broadPlan = {
          ...validation.optimizedPlan,
          // Keep only the security-critical scoping; drop what the model chose.
          filters: Object.fromEntries(
            Object.entries(validation.optimizedPlan.filters).filter(
              ([k]) => ['organizationId', 'assignedToId'].includes(k)
            )
          ),
          take: Math.min(validation.optimizedPlan.take ?? 25, 25),
        };

        try {
          broadenedRows = await this.executeDatabaseQuery(broadPlan, organizationId, userId, userRole);
          if (broadenedRows.length > 0) {
            droppedFilters = narrowing;
            queriesRun.push(`[Agentic Retry] Broadened by dropping [${narrowing.join(', ')}] — found ${broadenedRows.length} row(s)`);
            this.logger.log(`[Agentic Retry] Broader query returned ${broadenedRows.length} row(s).`);
            // Surface the broader set. Reporting "none" while related records exist is
            // the more harmful error; the composer is told these are unfiltered.
            rows = broadenedRows;
          }
        } catch (err) {
          this.logger.warn(`[Agentic Retry] Broadened query failed: ${err.message}`);
        }
      }
    }

    // Layer 7: Verification
    const verification = this.verifyResults(rows);
    if (!verification.isVerified) {
      errors.push(verification.businessError || 'Result verification failed.');
    }

    // Layer 8: Confidence Calculation
    const confidenceScore = this.calculateSQLConfidence(
      queryText,
      validation.optimizedPlan,
      rows,
      validation.isValid,
      verification.isVerified
    );

    return {
      rows,
      verified: verification.isVerified,
      confidenceScore,
      tablesUsed: plan.entities,
      queriesRun,
      errors,
      rawLlmResponse: plan._rawLlmResponse,
      parseError: plan._parseError,
      generatedPlan: plan,
      validationResult: validation,
      // Set when the original filters matched nothing and the broadened retry did.
      // The composer must say so rather than presenting these as an exact match.
      broadened: droppedFilters.length > 0
        ? { droppedFilters, rowCount: rows.length }
        : null,
      // Filters that were repaired or dropped as impossible, so the answer can
      // explain why it is showing more than was literally asked for.
      filterRepairs: coercionNotes.map(n => n.reason),
    };
  }
}

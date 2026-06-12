import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiLlmService } from './ai-llm.service';

export interface DatabasePipelineResult {
  rows: any[];
  verified: boolean;
  confidenceScore: number;
  tablesUsed: string[];
  queriesRun: string[];
  errors: string[];
}

// Layer 1: Schema Registry
export const SCHEMA_REGISTRY = {
  tables: {
    property: {
      name: 'Property',
      description: 'Real estate listings for rent or sale.',
      columns: {
        id: 'uuid primary key',
        title: 'title or name of listing',
        type: 'APARTMENT, VILLA, COMMERCIAL, PLOT',
        status: 'DRAFT, PUBLISHED, SOLD, RENTED, AVAILABLE',
        listingType: 'RENT, SALE',
        price: 'asking price or rental amount (AED)',
        location: 'geographical location (e.g. Dubai Marina, JVC, Downtown)',
        bedrooms: 'number of bedrooms',
        bathrooms: 'number of bathrooms',
        areaSqft: 'total area in square feet',
        ownerId: 'link to landlord/owner profile'
      }
    },
    employeeprofile: {
      name: 'EmployeeProfile',
      description: 'Internal staff members and designations.',
      columns: {
        id: 'uuid primary key',
        userId: 'associated user account link',
        department: 'department (e.g., Sales, HR, Finance, Logistics)',
        designation: 'job title (e.g. agent, manager, COO)',
        salary: 'monthly base salary',
        status: 'ACTIVE, ON_LEAVE, TERMINATED'
      }
    },
    attendance: {
      name: 'Attendance',
      description: 'Daily check-in logs for employee attendance.',
      columns: {
        id: 'uuid primary key',
        dateStr: 'format YYYY-MM-DD',
        checkIn: 'timestamp',
        checkOut: 'timestamp',
        status: 'PRESENT, LATE, ABSENT, ON_LEAVE',
        employeeProfileId: 'link to employee profile'
      }
    },
    payroll: {
      name: 'Payroll',
      description: 'Monthly payroll salary batches disbursed to employees.',
      columns: {
        id: 'uuid primary key',
        month: 'format YYYY-MM',
        baseSalary: 'base salary amount',
        allowances: 'bonus/allowance amount',
        deductions: 'deducted amount',
        netSalary: 'net payout',
        status: 'PAID, UNPAID',
        employeeProfileId: 'link to employee profile'
      }
    },
    task: {
      name: 'Task',
      description: 'Task checklists and todos assigned to staff.',
      columns: {
        id: 'uuid primary key',
        title: 'title of the task',
        status: 'PENDING, IN_PROGRESS, COMPLETED',
        dueDate: 'timestamp when task is due',
        assignedToId: 'link to user assigned'
      }
    },
    lead: {
      name: 'Lead',
      description: 'Open sales leads and prospects.',
      columns: {
        id: 'uuid primary key',
        name: 'lead name',
        status: 'NEW, CONTACTED, ENGAGED, DISQUALIFIED, CLOSED',
        score: 'lead score index',
        assignedToId: 'user assigned to broker this lead'
      }
    },
    client: {
      name: 'Client',
      description: 'CRM Clients profiles representing buyers/tenants/investors.',
      columns: {
        id: 'uuid primary key',
        name: 'client name',
        type: 'BUYER, SELLER, INVESTOR',
        stage: 'INQUIRY, VIEWING, OFFER, CLOSED',
        budget: 'target investment/rental budget (AED)'
      }
    }
  }
};

@Injectable()
export class DatabasePipelineService {
  private readonly logger = new Logger(DatabasePipelineService.name);

  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService
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

    const nlsPrompt = `You are the Zorvex AI V9 NL-to-SQL & Query Plan Generator (Layer 3).
Convert the user request query step into a structured database query plan parameters object for Prisma.

User Query: "${queryText}"
Target Models: ${JSON.stringify(mappedEntities)}
Schema Registry:
${JSON.stringify(schemaSub, null, 2)}

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

Return ONLY raw JSON matching the format. Do not include markdown code block tags.`;

    try {
      const resText = await this.llmService.callLLM(
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
        const parsed = JSON.parse(cleanJson.substring(jsonStart, jsonEnd + 1));
        return parsed;
      }
    } catch (e) {
      this.logger.warn(`NL-to-SQL engine parsing failed: ${e.message}`);
    }

    // Default basic prisma arguments fallback
    return {
      operation: 'fetch',
      entities: mappedEntities,
      filters: {},
      take: 20
    };
  }

  // Layer 4 & 5: SQL Validation Engine & Query Optimization Engine
  validateAndOptimizeQuery(queryPlan: any, userRole: string): { isValid: boolean; errorMsg?: string; optimizedPlan: any } {
    this.logger.log(`[Layer 4 & 5: Validation & Optimization] Validating Prisma query plan parameters`);

    // Validation checks
    const unauthorizedEntities = ['payroll'];
    if (queryPlan.entities.some(e => unauthorizedEntities.includes(e))) {
      const isAuthorized = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(userRole);
      if (!isAuthorized) {
        return {
          isValid: false,
          errorMsg: 'Clearance Required: Your user profile is not cleared to access secure finance databases.',
          optimizedPlan: null
        };
      }
    }

    const logisticsEntities = ['vehicle', 'logisticsschedule'];
    if (queryPlan.entities.some(e => logisticsEntities.includes(e))) {
      const isAuthorized = ['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'].includes(userRole);
      if (!isAuthorized) {
        return {
          isValid: false,
          errorMsg: 'Clearance Required: Your user profile is not cleared to access secure logistics databases.',
          optimizedPlan: null
        };
      }
    }

    // Block modifications - only read queries allowed
    if (queryPlan.operation === 'delete' || queryPlan.operation === 'update' || queryPlan.operation === 'create') {
      return {
        isValid: false,
        errorMsg: 'Security Violation: Database retrieval pipeline is strictly READ ONLY. Alter/Delete statements blocked.',
        optimizedPlan: null
      };
    }

    // Optimization step
    const optimized = { ...queryPlan };
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
      attendance: 'attendance',
      leaverequest: 'leaveRequest',
      property: 'property',
      lead: 'lead',
      client: 'client',
      task: 'task',
      payroll: 'payroll',
      owner: 'owner'
    };

    const getBaseTenantFilter = (entityKey: string, orgId: string): any => {
      const hasDirectOrgId = [
        'organization', 'user', 'employeeprofile', 'property', 'lead',
        'client', 'task', 'owner', 'attendance', 'leaverequest', 'payroll'
      ];
      if (entityKey === 'organization') return { id: orgId };
      if (hasDirectOrgId.includes(entityKey)) return { organizationId: orgId };
      return {};
    };

    // Deep date resolver helper
    const resolveDateStrings = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'string') {
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
        if (isoDateRegex.test(obj)) {
          const date = new Date(obj);
          if (!isNaN(date.getTime())) {
            return date;
          }
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
      const tenantFilter = getBaseTenantFilter(ent.toLowerCase(), organizationId);
      const whereClause = { ...tenantFilter, ...cleanFilters };

      // Role boundaries injection
      if (userRole === 'AGENT') {
        if (['lead', 'task', 'client'].includes(ent.toLowerCase())) {
          whereClause.assignedToId = userId;
        }
      }

      try {
        if (optimizedPlan.operation === 'aggregate') {
          const aggArgs: any = {
            where: whereClause,
            _count: true
          };
          if (optimizedPlan.metrics && optimizedPlan.metrics.length > 0) {
            aggArgs._sum = {};
            aggArgs._avg = {};
            for (const m of optimizedPlan.metrics) {
              aggArgs._sum[m] = true;
              aggArgs._avg[m] = true;
            }
          }

          if (optimizedPlan.groupBy && optimizedPlan.groupBy.length > 0) {
            const groupByArgs = {
              by: optimizedPlan.groupBy,
              where: whereClause,
              _count: true,
              ...(optimizedPlan.metrics && optimizedPlan.metrics.length > 0 ? {
                _sum: aggArgs._sum,
                _avg: aggArgs._avg
              } : {})
            };
            const rows = await model.groupBy(groupByArgs);
            results.push(...rows);
          } else {
            const aggResult = await model.aggregate(aggArgs);
            results.push(aggResult);
          }
        } else {
          // Default: Fetch rows
          let includeOptions: any = undefined;
          if (ent.toLowerCase() === 'property') {
            includeOptions = { owner: { select: { name: true, phone: true } } };
          } else if (ent.toLowerCase() === 'employeeprofile') {
            includeOptions = { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } };
          }

          const rows = await model.findMany({
            where: whereClause,
            include: includeOptions,
            take: optimizedPlan.take,
            orderBy: { createdAt: 'desc' } as any
          }).catch(async () => {
            return await model.findMany({
              where: whereClause,
              include: includeOptions,
              take: optimizedPlan.take
            });
          });

          // Salary masking rule
          if (ent.toLowerCase() === 'employeeprofile') {
            const canViewSalaries = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(userRole);
            const sanitized = rows.map((emp: any) => {
              const copy = { ...emp };
              if (!canViewSalaries && emp.userId !== userId) {
                copy.salary = "CONFIDENTIAL (Access Denied)";
              }
              return copy;
            });
            results.push(...sanitized);
          } else {
            results.push(...rows);
          }
        }
      } catch (err) {
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

  // Entry Point: Run the entire Database Retrieval Pipeline
  async runDatabaseRetrievalPipeline(
    queryText: string,
    organizationId: string,
    userId: string,
    userRole: string
  ): Promise<DatabasePipelineResult> {
    const errors: string[] = [];
    const queriesRun: string[] = [];

    // Layer 2: Semantic Mapping
    const mapping = this.semanticMapping(queryText);

    // Layer 3: NL-to-SQL
    const plan = await this.generateQueryPlan(
      queryText,
      mapping.mappedEntities,
      organizationId,
      userId,
      userRole
    );
    queriesRun.push(`Prisma Query Plan on [${plan.entities.join(', ')}]`);

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
        errors
      };
    }

    // Layer 6: Execution
    const rows = await this.executeDatabaseQuery(
      validation.optimizedPlan,
      organizationId,
      userId,
      userRole
    );

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
      errors
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { AiNewLlmService } from '../ai-new-llm.service';
import { SchemaUnderstandingResult } from './schema-understanding.service';
import { PermissionValidationResult, UserContext } from './permission-validation.service';
import { QueryUnderstandingResult } from './query-understanding.service';
import { SchemaDictionary } from './schema-dictionary';
import { parse } from 'pgsql-ast-parser';
import { IntelligentCacheService } from '../cache/intelligent-cache.service';

export interface SqlGenerationResult {
  queryPlan: string;
  sql: string;
  confidence: number;
  metadata: {
    provider?: string;
  };
}

@Injectable()
export class SqlGenerationService {
  private readonly logger = new Logger(SqlGenerationService.name);

  constructor(
    private readonly llmService: AiNewLlmService,
    private readonly cacheService: IntelligentCacheService
  ) {}

  private extractTables(astNode: any, tables = new Set<string>()): Set<string> {
    if (!astNode) return tables;
    
    if (Array.isArray(astNode)) {
      astNode.forEach(child => this.extractTables(child, tables));
      return tables;
    }

    if (typeof astNode === 'object') {
      if (astNode.type === 'table' && astNode.name) {
        if (typeof astNode.name === 'string') {
          tables.add(astNode.name);
        } else if (typeof astNode.name === 'object' && astNode.name.name) {
          tables.add(astNode.name.name);
        }
      }
      for (const key of Object.keys(astNode)) {
        this.extractTables(astNode[key], tables);
      }
    }

    return tables;
  }

  async generateSql(
    queryResult: QueryUnderstandingResult,
    permissionResult: PermissionValidationResult,
    userContext: UserContext
  ): Promise<SqlGenerationResult> {
    this.logger.log('Starting Natural Language to SQL Translation (Layer 4)');

    const maskedSchema = permissionResult.schema;
    const markdownSchema = this.buildContextualSchema(maskedSchema);

    // Prompt Construction
    const systemPrompt = `You are a strict, enterprise-grade PostgreSQL expert. Your sole purpose is to translate user natural language requests into valid PostgreSQL queries.

MANDATORY RULES:
1. ONLY use the tables and columns provided in the EXACT SCHEMA below.
2. DO NOT invent tables. DO NOT invent columns.
3. If a request cannot be satisfied with the provided schema, generate a query that comes as close as possible without violating rule 1, or output "ERROR: Cannot map to schema".
4. Output your response in two parts: first a logical "Query Plan" (Chain of Thought), then the final SQL query enclosed in \`\`\`sql ... \`\`\` block.
5. CONTEXT HINTS: The user belongs to organization ID '${userContext.organizationId}' and has role '${userContext.role}'. Use these facts as logical hints for joining tables (e.g., if filtering by their org). Do NOT hardcode them into WHERE clauses as a security measure, the database engine will automatically enforce Row Level Security. However, you MUST ensure you select from tables that semantically relate to these hints if asked for 'my' or 'our' data.
6. If your query uses UNION or UNION ALL, ALL SELECT statements must have exactly the same number of columns with compatible data types. Pad missing columns with \`NULL AS column_name\` or shared generic aliases.
7. You MUST enclose all table names and column names in double quotes (e.g. "User", "EmployeeProfile", "organizationId") to preserve case sensitivity. This is critical because the database uses Prisma, which creates case-sensitive tables and columns.

EXACT AUTHORIZED SCHEMA:
${markdownSchema}
`;

    // Extract timeframes if present to provide clear context
    let timeframeContext = '';
    if (queryResult.timeframe) {
      timeframeContext = `Note: The user asked for a specific timeframe. Resolve it to these dates: ${queryResult.timeframe.startDate} to ${queryResult.timeframe.endDate}.`;
    }

    const userPrompt = `User Request: "${queryResult.originalQuery}"
Intent: ${queryResult.intent}

${timeframeContext}

Generate the Query Plan and the PostgreSQL query.`;

    // Call the LLM with retry loop for required tables validation
    const maxRetries = 3;
    let attempt = 0;
    let currentPrompt = userPrompt;

    const cacheKey = this.cacheService.generateKey('sql_generation', userContext.organizationId, userContext.id, queryResult.originalQuery);
    const cachedResult = this.cacheService.get<SqlGenerationResult>(cacheKey);
    if (cachedResult) {
      this.logger.log('Cache Hit: SQL Generation returned from L1 Cache.');
      return cachedResult;
    }

    while (attempt < maxRetries) {
      attempt++;
      try {
        const { text, provider } = await this.llmService.callLLM(
          systemPrompt,
          currentPrompt,
          [],
          false,
          userContext.organizationId,
          userContext.id
        );

        // Extract SQL from the markdown response
        const sqlMatch = text.match(/```sql([\s\S]*?)```/);
        let sql = '';
        let queryPlan = text;

        if (sqlMatch && sqlMatch[1]) {
          sql = sqlMatch[1].trim();
          queryPlan = text.replace(sqlMatch[0], '').trim();
        } else {
          // Fallback: If LLM didn't use markdown blocks properly
          this.logger.warn('LLM did not wrap SQL in ```sql blocks. Attempting heuristic parsing.');
          const lines = text.split('\n');
          const sqlLines = lines.filter(l => l.toUpperCase().startsWith('SELECT') || l.toUpperCase().startsWith('WITH'));
          if (sqlLines.length > 0) {
            const startIndex = lines.indexOf(sqlLines[0]);
            sql = lines.slice(startIndex).join('\n').trim();
            queryPlan = lines.slice(0, startIndex).join('\n').trim();
          }
        }

        // --- VALIDATION: Ensure ALL required tables are used ---
        let usedTables = new Set<string>();
        try {
          const ast = parse(sql);
          usedTables = this.extractTables(ast);
        } catch (e) {
          // Syntax error, let validation layer handle it, or we can just pass
          this.logger.warn(`Could not parse AST during generation validation: ${e.message}`);
        }

        const allowedTables = (maskedSchema.tables || []).map(t => typeof t === 'string' ? t.toLowerCase() : '');
        const usedTablesArr = Array.from(usedTables).map(t => t.toLowerCase());
        
        const unauthorizedTables = usedTablesArr.filter(ut => ut && !allowedTables.includes(ut));

        if (unauthorizedTables.length > 0 && attempt < maxRetries) {
          this.logger.warn(`LLM used unauthorized tables: ${unauthorizedTables.join(', ')}. Retrying (attempt ${attempt + 1})...`);
          currentPrompt += `\n\nERROR ON PREVIOUS ATTEMPT: You used unauthorized tables: ${unauthorizedTables.join(', ')}. You are strictly forbidden from using any tables not listed in the EXACT AUTHORIZED SCHEMA. Regenerate the SQL using ONLY allowed tables.`;
          continue; // Retry
        }

        const result: SqlGenerationResult = {
          queryPlan,
          sql,
          confidence: 0.9,
          metadata: { provider }
        };

        this.logger.debug(`Generated SQL on attempt ${attempt + 1}:\n${sql}`);

        // Cache the successful generation
        await this.cacheService.set(cacheKey, result, 3600); // Cache for 24 hours
        return result;

      } catch (err) {
        if (attempt >= maxRetries) {
          this.logger.error(`SQL Generation failed after ${maxRetries} attempts: ${err.message}`, err.stack);
          throw err;
        }
      }
    }
    
    throw new Error('Failed to generate valid SQL after retries');
  }

  /**
   * Dynamically build a schema markdown string containing ONLY authorized tables and columns
   */
  private buildContextualSchema(schemaResult: SchemaUnderstandingResult): string {
    let markdown = '';
    for (const table of schemaResult.tables) {
      const dictTable = SchemaDictionary[table];
      if (!dictTable) continue;

      markdown += `Table: ${table}\n`;
      
      const allowedColumns = schemaResult.columns[table] || [];
      markdown += `- Authorized Columns: ${allowedColumns.join(', ')}\n`;

      const joins = dictTable.relationships.map(r => `${r.foreignKey} references ${r.targetTable}(id)`);
      if (joins.length > 0) {
        markdown += `- Relationships: ${joins.join(', ')}\n`;
      }
      markdown += '\n';
    }
    return markdown;
  }
}

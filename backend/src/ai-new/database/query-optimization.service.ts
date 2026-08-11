import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parse } from 'pgsql-ast-parser';

export interface OptimizationResult {
  optimized: boolean;
  originalCost: number | null;
  optimizedCost: number | null;
  changes: string[];
  finalSql: string;
  pagination?: {
    required: boolean;
    limitApplied: number | null;
    totalRows: number;
    hasMore: boolean;
  };
}

@Injectable()
export class QueryOptimizationService {
  private readonly logger = new Logger(QueryOptimizationService.name);

  constructor(
    private readonly prisma: PrismaService
  ) {}

  public async optimizeQuery(sql: string, schema: any): Promise<OptimizationResult> {
    const issues = this.analyzeAst(sql);
    let originalCost: number | null = null;
    let optimizedCost: number | null = null;
    let finalSql = sql;
    let changes: string[] = [];
    let optimized = false;

    // 1. Get original cost
    originalCost = await this.getPostgresCost(sql);

    // 2. If issues found, apply deterministic rewrites
    if (issues.length > 0) {
      this.logger.log(`Optimization issues found: ${issues.join(', ')}. Applying deterministic fixes...`);
      
      const rewriteResult = this.applyDeterministicFixes(sql, issues);
      
      if (rewriteResult.sql !== sql) {
        // 3. Evaluate rewritten query cost
        optimizedCost = await this.getPostgresCost(rewriteResult.sql);
        
        // 4. Accept optimization
        optimized = true;
        finalSql = rewriteResult.sql;
        changes = rewriteResult.changes;
        this.logger.log(`Query optimized successfully. Original Cost: ${originalCost}, New Cost: ${optimizedCost}`);
      }
    }
    let pagination: OptimizationResult['pagination'];
    try {
      // Async COUNT(*) for total rows using original SQL (before LIMIT injection)
      const countSql = `SELECT COUNT(*)::int as count FROM (${sql.replace(/;$/, '')}) as q`;
      const countResult: any[] = await this.prisma.$queryRawUnsafe(countSql);
      const totalRows = countResult && countResult.length > 0 ? Number(countResult[0].count) : 0;
      
      let limitApplied: number | null = null;
      const limitMatch = finalSql.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) {
        limitApplied = parseInt(limitMatch[1], 10);
      }

      pagination = {
        required: limitApplied !== null && totalRows > limitApplied,
        limitApplied,
        totalRows,
        hasMore: limitApplied !== null && totalRows > limitApplied
      };
    } catch (e) {
      this.logger.warn(`Failed to calculate total rows: ${e.message}`);
    }

    return {
      optimized,
      originalCost,
      optimizedCost,
      changes,
      finalSql,
      pagination
    };
  }

  private analyzeAst(sql: string): string[] {
    const issues: string[] = [];
    try {
      const ast = parse(sql);
      if (!ast || ast.length === 0) return issues;
      
      const statement = ast[0];

      if (statement.type === 'select') {
        // 1. Pagination Check
        if (!statement.limit) {
          issues.push('Missing LIMIT clause. Add LIMIT 100 or LIMIT 1000 to prevent large result sets.');
        }

        // 2. Projection Check
        if (statement.columns && Array.isArray(statement.columns)) {
          const hasSelectStar = statement.columns.some((col: any) => 
            col.expr && col.expr.type === 'ref' && col.expr.name === '*'
          );
          if (hasSelectStar) {
            issues.push('SELECT * is used. Replace with explicit column names if possible.');
          }
        }

        // 3. Predicate Optimization Check
        // Recursively look for function calls in the WHERE clause
        const checkWhere = (node: any) => {
          if (!node) return;
          if (node.type === 'call') {
            const funcName = node.function?.name;
            if (funcName && ['date', 'year', 'month', 'extract'].includes(funcName.toLowerCase())) {
              issues.push(`Function call '${funcName}' used in WHERE clause. Rewrite as range query (e.g. >= AND <) to utilize indexes.`);
            }
          }
          if (typeof node === 'object') {
            for (const key of Object.keys(node)) {
              checkWhere(node[key]);
            }
          }
        };

        if (statement.where) {
          checkWhere(statement.where);
        }
      }
      
      return Array.from(new Set(issues));
    } catch (e) {
      this.logger.warn(`Failed to parse AST for optimization analysis: ${e.message}`);
      return [];
    }
  }

  private async getPostgresCost(sql: string): Promise<number | null> {
    try {
      const explainResult: any = await this.prisma.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) ${sql}`);
      if (explainResult && Array.isArray(explainResult) && explainResult.length > 0) {
        const plan = explainResult[0]['QUERY PLAN']?.[0]?.Plan;
        if (plan && plan['Total Cost']) {
          return plan['Total Cost'];
        }
      }
      return null;
    } catch (e) {
      this.logger.warn(`Failed to get EXPLAIN cost: ${e.message}`);
      return null;
    }
  }

  private applyDeterministicFixes(sql: string, issues: string[]): { sql: string; changes: string[] } {
    let finalSql = sql;
    const changes: string[] = [];

    // Check for missing LIMIT
    const missingLimit = issues.some(i => i.includes('Missing LIMIT'));
    if (missingLimit) {
      // Intelligently append LIMIT 100 before the semicolon if it exists
      if (finalSql.trim().endsWith(';')) {
        finalSql = finalSql.replace(/;+\s*$/, ' LIMIT 100;');
      } else {
        finalSql = finalSql + ' LIMIT 100';
      }
      changes.push('Added safety LIMIT 100 clause to prevent massive data retrieval.');
    }

    // SELECT * and function calls are flagged as warnings but not automatically rewritten 
    // to avoid complex AST manipulation that could break the query. 
    // The LIMIT clause is usually sufficient to prevent catastrophic performance.
    if (issues.some(i => i.includes('SELECT *'))) {
       changes.push('Warning: SELECT * detected. Consider selecting explicit columns in future queries.');
    }
    if (issues.some(i => i.includes('Function call'))) {
       changes.push('Warning: Functions in WHERE clause detected. May cause full table scans.');
    }

    return { sql: finalSql, changes };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'pgsql-ast-parser';
import { PrismaService } from '../../prisma/prisma.service';

export interface SqlValidationResult {
  valid: boolean;
  syntax: boolean;
  tablesValid: boolean;
  columnsValid: boolean;
  permissionsValid: boolean;
  unionValid?: boolean;
  queryType: string;
  estimatedCost: number;
  confidence: number;
  stageFailed?: number;
  reason?: string;
  planRows?: number;
  environment?: string;
}

@Injectable()
export class SqlValidationService {
  private readonly logger = new Logger(SqlValidationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recursively extract all table names referenced in the AST
   */
  public extractTables(astNode: any, tables = new Set<string>()): Set<string> {
    if (!astNode) return tables;
    
    if (Array.isArray(astNode)) {
      astNode.forEach(child => this.extractTables(child, tables));
      return tables;
    }

    if (typeof astNode === 'object') {
      if (astNode.type === 'table' && astNode.name) {
        if (typeof astNode.name === 'string') {
          tables.add(astNode.name); // Case-sensitive or insensitive depending on your DB
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

  /**
   * Stage 1A Helper: Recursively check if the AST contains any mutation operation
   */
  private containsMutationOperation(astNode: any): boolean {
    if (!astNode) return false;

    if (Array.isArray(astNode)) {
      for (const child of astNode) {
        if (this.containsMutationOperation(child)) return true;
      }
      return false;
    }

    if (typeof astNode === 'object') {
      const typeStr = (astNode.type || '').toLowerCase();
      const mutationTypes = ['insert', 'update', 'delete', 'drop', 'alter', 'truncate'];
      if (mutationTypes.includes(typeStr)) {
        return true;
      }
      
      for (const key of Object.keys(astNode)) {
        if (this.containsMutationOperation(astNode[key])) return true;
      }
    }

    return false;
  }

  /**
   * Stage 1B Helper: Recursively check UNION structures for column count matching
   * Returns { valid: boolean, reason?: string }
   */
  private validateUnionStructures(astNode: any): { valid: boolean; reason?: string } {
    if (!astNode) return { valid: true };

    if (Array.isArray(astNode)) {
      for (const child of astNode) {
        const result = this.validateUnionStructures(child);
        if (!result.valid) return result;
      }
      return { valid: true };
    }

    if (typeof astNode === 'object') {
      const typeStr = (astNode.type || '').toLowerCase();
      
      // If it's a union, check left and right branches for column counts
      // pgsql-ast-parser usually structures unions with 'left' and 'right'
      if (typeStr === 'union' || typeStr === 'union all') {
        const leftCols = this.getColumnCount(astNode.left);
        const rightCols = this.getColumnCount(astNode.right);
        
        if (leftCols !== -1 && rightCols !== -1 && leftCols !== rightCols) {
          return { valid: false, reason: `UNION column count mismatch: Left branch has ${leftCols} columns, but right branch has ${rightCols} columns.` };
        }
      }

      for (const key of Object.keys(astNode)) {
        const result = this.validateUnionStructures(astNode[key]);
        if (!result.valid) return result;
      }
    }

    return { valid: true };
  }

  private getColumnCount(selectNode: any): number {
    if (!selectNode) return -1;
    // Handle nested unions or parenthesized selects
    if (selectNode.type === 'union' || selectNode.type === 'union all') {
      return this.getColumnCount(selectNode.left);
    }
    if (selectNode.columns && Array.isArray(selectNode.columns)) {
      return selectNode.columns.length;
    }
    return -1;
  }

  async validateSql(
    sql: string,
    allowedSchema: any, // Pass the schema from Layer 3 PermissionValidationResult
    businessPolicy: { maxCost: number; maxRows: number } = { maxCost: 100000, maxRows: 10000 }
  ): Promise<SqlValidationResult> {
    this.logger.log(`Starting Multi-Stage Performance Validation...`);

    // ============================================
    // STAGE 1: Static AST Validation & Security
    // ============================================
    // Default object for tracking
    const resultBase = {
      valid: false,
      syntax: true,
      tablesValid: true,
      columnsValid: true,
      permissionsValid: true,
      unionValid: true,
      queryType: 'UNKNOWN',
      estimatedCost: 0,
      confidence: 0,
    };

    let ast: any[];
    try {
      ast = parse(sql);
    } catch (error) {
      return { ...resultBase, syntax: false, stageFailed: 1, reason: `Syntax Error: ${error.message}` };
    }

    if (ast.length !== 1) {
      const reason = 'Only single queries are allowed to prevent injection';
      this.logger.warn(`Validation Failed (Stage 1): ${reason}`);
      return { ...resultBase, queryType: 'MULTIPLE', stageFailed: 1, reason };
    }

    const statement = ast[0];
    const queryType = statement.type || 'UNKNOWN';

    // ============================================
    // STAGE 1A: Safe Validation (Mutation Check)
    // ============================================
    if (this.containsMutationOperation(statement)) {
      const reason = `Destructive query detected. Mutations (INSERT, UPDATE, DELETE, etc.) are strictly prohibited.`;
      this.logger.warn(`Validation Failed (Stage 1A): ${reason}`);
      return { ...resultBase, queryType, stageFailed: 1, reason };
    }

    // ============================================
    // STAGE 1B: Structural Validation
    // ============================================

    // 1. UNION structural check
    const unionValidation = this.validateUnionStructures(statement);
    if (!unionValidation.valid) {
      this.logger.warn(`Validation Failed (Stage 1B): ${unionValidation.reason}`);
      return { ...resultBase, queryType, unionValid: false, stageFailed: 1, reason: unionValidation.reason };
    }

    // 2. Permission Re-check (Unauthorized Tables)
    const usedTables = this.extractTables(statement);
    if (allowedSchema && allowedSchema.tables && Array.isArray(allowedSchema.tables)) {
      const allowedTableNames = allowedSchema.tables
        .filter(t => t && typeof t === 'string')
        .map((t: string) => t.toLowerCase());
      for (const table of usedTables) {
        if (!table || typeof table !== 'string') continue;
        if (!allowedTableNames.includes(table.toLowerCase())) {
           const reason = `Permission Denied: The table '${table}' is not in your authorized schema.`;
           this.logger.warn(`Validation Failed (Stage 1B Permissions): ${reason}`);
           return { ...resultBase, queryType, permissionsValid: false, stageFailed: 1, reason };
        }
      }
    }

    // 3. Join Limit Check (Heuristic)
    let joinCount = 0;
    if (statement.from && Array.isArray(statement.from)) {
      for (const fromItem of statement.from) {
        if (fromItem.type === 'join') joinCount++;
      }
    }
    if (joinCount > 5) {
      const reason = `Query exceeds maximum allowed JOIN limit (5)`;
      this.logger.warn(`Validation Failed (Stage 1B Limit): ${reason}`);
      return { ...resultBase, queryType, stageFailed: 1, reason };
    }

    // ============================================
    // STAGE 2: Database EXPLAIN Analysis (Deep Check)
    // ============================================
    let explainPlan: any;
    // Declared outside the try so the catch block can log the exact query that
    // failed. It was previously scoped inside the try, which meant this file did
    // not compile at all.
    const safeSql = sql.replace(/;+$/, ''); // Strip trailing semicolon to append cleanly
    try {
      // Strict timeout to protect against heavy EXPLAIN evaluation
      await this.prisma.$executeRawUnsafe(`SET statement_timeout = 2000;`);

      // We use raw query EXPLAIN to let Postgres validate Tables, Columns, Joins, and return Cost.
      const result: any[] = await this.prisma.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) ${safeSql}`);

      explainPlan = result[0]['QUERY PLAN'][0].Plan;

    } catch (error) {
      const errorMsg = error.message.toLowerCase();
      let tablesValid = true;
      let columnsValid = true;
      if (errorMsg.includes('relation') && errorMsg.includes('does not exist')) tablesValid = false;
      if (errorMsg.includes('column') && errorMsg.includes('does not exist')) columnsValid = false;
      
      const reason = `Database Validation Error: ${error.message}`;
      this.logger.warn(`Validation Failed (Stage 2 EXPLAIN): ${reason}\nQuery: ${safeSql}`);
      return { ...resultBase, queryType, tablesValid, columnsValid, stageFailed: 2, reason };
    } finally {
      // Reset timeout
      await this.prisma.$executeRawUnsafe(`RESET statement_timeout;`);
    }

    const totalCost = explainPlan['Total Cost'];
    const planRows = explainPlan['Plan Rows'];
    
    // ============================================
    // STAGE 3: Business & Organization Policies
    // ============================================
    if (totalCost > businessPolicy.maxCost) {
       return { 
         ...resultBase, queryType, stageFailed: 3, estimatedCost: totalCost, planRows, 
         reason: `Total Cost (${totalCost}) exceeds organization limit (${businessPolicy.maxCost})` 
       };
    }

    if (planRows > businessPolicy.maxRows) {
       return { 
         ...resultBase, queryType, stageFailed: 3, estimatedCost: totalCost, planRows, 
         reason: `Estimated Rows (${planRows}) exceeds organization limit (${businessPolicy.maxRows})` 
       };
    }

    this.logger.log(`Validation Passed. Cost: ${totalCost}, Rows: ${planRows}`);

    return {
      valid: true,
      syntax: true,
      tablesValid: true,
      columnsValid: true,
      permissionsValid: true,
      unionValid: true,
      queryType,
      estimatedCost: totalCost,
      confidence: 1.0,
      planRows,
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

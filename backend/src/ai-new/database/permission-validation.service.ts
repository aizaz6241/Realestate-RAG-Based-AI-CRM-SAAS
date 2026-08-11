import { Injectable, Logger } from '@nestjs/common';
import { SchemaUnderstandingResult } from './schema-understanding.service';
import { PermissionRegistry } from './permission-registry';
import { Role } from '@prisma/client';

export interface UserContext {
  id: string;
  role: Role | string;
  organizationId: string;
  branch?: string;
}

export interface PermissionValidationResult {
  isAuthorized: boolean;
  reason?: string;
  schema: SchemaUnderstandingResult;
  rowLevelFilters: Record<string, string[]>;
}

@Injectable()
export class PermissionValidationService {
  private readonly logger = new Logger(PermissionValidationService.name);

  validatePermissions(
    userContext: UserContext,
    schemaResult: SchemaUnderstandingResult
  ): PermissionValidationResult {
    this.logger.log(`Validating permissions for role: ${userContext.role}`);

    const roleConfig = PermissionRegistry[userContext.role as Role];
    
    // Fallback if role is not found in registry
    if (!roleConfig) {
      this.logger.warn(`Role ${userContext.role} not found in PermissionRegistry. Denying access.`);
      return {
        isAuthorized: false,
        reason: `Role '${userContext.role}' is not configured for data access.`,
        schema: schemaResult,
        rowLevelFilters: {}
      };
    }

    // 1. Super Admin Check
    if (roleConfig.isSuperAdmin) {
      this.logger.log('Super Admin access granted. Applying global tenant filter.');
      return this.grantAccessWithGlobalFilters(userContext, schemaResult, roleConfig);
    }

    // 2. Table-Level Check (RBAC)
    if (roleConfig.allowedTables !== '*') {
      const allowedSet = new Set(roleConfig.allowedTables || []);
      for (const table of schemaResult.tables) {
        if (!allowedSet.has(table)) {
          this.logger.warn(`Access denied. Role ${userContext.role} cannot access table ${table}.`);
          return {
            isAuthorized: false,
            reason: `You are not authorized to view information related to '${table}'.`,
            schema: schemaResult,
            rowLevelFilters: {}
          };
        }
      }
    }

    // 3. Column-Level Check (Masking)
    const modifiedSchema = JSON.parse(JSON.stringify(schemaResult)) as SchemaUnderstandingResult; // Deep copy
    if (roleConfig.restrictedColumns) {
      for (const [table, columns] of Object.entries(modifiedSchema.columns)) {
        const restrictedForTable = roleConfig.restrictedColumns[table];
        if (restrictedForTable && restrictedForTable.length > 0) {
          const restrictedSet = new Set(restrictedForTable);
          // Filter out the restricted columns
          const originalLength = columns.length;
          modifiedSchema.columns[table] = columns.filter(c => !restrictedSet.has(c));
          if (modifiedSchema.columns[table].length < originalLength) {
             this.logger.log(`Masked restricted columns in table ${table} for role ${userContext.role}`);
          }
        }
      }
    }

    // 4. Row-Level Security (RLS)
    return this.grantAccessWithGlobalFilters(userContext, modifiedSchema, roleConfig);
  }

  private grantAccessWithGlobalFilters(
    userContext: UserContext,
    schema: SchemaUnderstandingResult,
    roleConfig: any
  ): PermissionValidationResult {
    const rowLevelFilters: Record<string, string[]> = {};

    for (const table of schema.tables) {
      rowLevelFilters[table] = [];

      // Global Tenant Isolation (Multi-Tenancy)
      // Every query must be restricted to the user's organizationId
      // Note: Not all tables have organizationId, but in SQL generation we will handle joining.
      // For now, we explicitly add it to every table we access if applicable.
      // Easiest is to add it as a general filter.
      rowLevelFilters[table].push(`${table}.organizationId = '${userContext.organizationId}'`);

      // Role-specific RLS (e.g. Agent only sees own tasks)
      if (roleConfig.rowLevelSecurity && roleConfig.rowLevelSecurity[table]) {
        let condition = roleConfig.rowLevelSecurity[table];
        // Replace placeholders like {userId} with actual values
        condition = condition.replace(/{userId}/g, userContext.id);
        if (userContext.branch) {
          condition = condition.replace(/{branch}/g, userContext.branch);
        }
        rowLevelFilters[table].push(condition);
      }
    }

    return {
      isAuthorized: true,
      schema,
      rowLevelFilters
    };
  }
}

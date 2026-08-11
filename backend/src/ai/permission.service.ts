import { Injectable, Logger } from '@nestjs/common';
import { getRoleConfig, ALWAYS_REDACTED, RolePermissionConfig } from './permission-registry';

export interface AccessDecision {
  allowed: boolean;
  /** Tables the role may not query, when denied. */
  deniedTables: string[];
  reason?: string;
}

/**
 * Enforces the role rules in permission-registry.ts.
 *
 * Three enforcement points, only the first of which previously existed (and only for
 * two hardcoded table lists):
 *
 *   1. **Table access** — can this role query these tables at all?
 *   2. **Row-level scoping** — an AGENT's query is rewritten to their own records.
 *      Previously an `assignedToId` filter was injected in one branch of the pipeline
 *      only, so other paths returned the whole tenant's rows.
 *   3. **Column redaction** — salary and passwordHash are stripped from results.
 *      Nothing did this before: `EmployeeProfile.salary` was reachable by any role
 *      that could read the table, and only a single ad-hoc check guarded it.
 *
 * Redaction happens on the returned rows rather than by narrowing the SELECT, so it
 * holds regardless of how the query was constructed — including through relations,
 * which is exactly how `salary` used to leak (`attendance -> employeeProfile.salary`).
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  private config(role: string | undefined): RolePermissionConfig {
    return getRoleConfig(role);
  }

  // ---------------------------------------------------------------------------
  // 1. Table access
  // ---------------------------------------------------------------------------
  canAccessTable(role: string | undefined, table: string): boolean {
    const cfg = this.config(role);
    if (cfg.isSuperAdmin || cfg.allowedTables === '*') return true;
    return cfg.allowedTables.includes(table.toLowerCase());
  }

  checkTables(role: string | undefined, tables: string[]): AccessDecision {
    const denied = tables
      .map(t => t.toLowerCase())
      .filter(t => !this.canAccessTable(role, t));

    if (denied.length === 0) return { allowed: true, deniedTables: [] };

    this.logger.warn(`[RBAC] Role ${role} denied access to: ${denied.join(', ')}`);
    return {
      allowed: false,
      deniedTables: denied,
      reason: `Your role (${role || 'unknown'}) is not cleared to access: ${denied.join(', ')}.`,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Row-level scoping
  // ---------------------------------------------------------------------------
  /**
   * Merges the role's row-level rules into a Prisma `where` clause.
   * Existing conditions are preserved — the scope is ANDed, never replaced, so a
   * user-supplied filter cannot widen the scope.
   */
  applyRowLevelSecurity(
    role: string | undefined,
    table: string,
    where: any,
    userId: string
  ): any {
    const cfg = this.config(role);
    if (cfg.isSuperAdmin) return where;

    const rule = cfg.rowLevelSecurity?.[table.toLowerCase()];
    if (!rule) return where;

    const resolved: Record<string, any> = {};
    for (const [field, value] of Object.entries(rule)) {
      resolved[field] = value === '{userId}' ? userId : value;
    }

    this.logger.log(`[RBAC] Row-level scope applied for ${role} on ${table}: ${JSON.stringify(resolved)}`);

    const base = where && Object.keys(where).length > 0 ? where : null;
    return base ? { AND: [base, resolved] } : resolved;
  }

  // ---------------------------------------------------------------------------
  // 3. Column redaction
  // ---------------------------------------------------------------------------
  getRestrictedColumns(role: string | undefined, table: string): string[] {
    const key = table.toLowerCase();
    const cfg = this.config(role);
    const always = ALWAYS_REDACTED[key] ?? [];
    // isSuperAdmin bypasses role restrictions but never ALWAYS_REDACTED.
    const roleSpecific = cfg.isSuperAdmin ? [] : (cfg.restrictedColumns?.[key] ?? []);
    return Array.from(new Set([...always, ...roleSpecific]));
  }

  /**
   * Strips restricted columns from result rows, following nested relations.
   *
   * `primaryTable` seeds the walk; nested objects are matched against the registry of
   * restricted column names for any table, because a joined record's shape does not
   * carry its table name. That is intentionally conservative: redacting a same-named
   * field on an unrelated table is a cosmetic loss, whereas leaking salary is not.
   */
  redactRows(role: string | undefined, primaryTable: string, rows: any[]): any[] {
    const cfg = this.config(role);

    // Everything this role must never see, across all tables.
    const forbidden = new Set<string>();
    for (const cols of Object.values(ALWAYS_REDACTED)) cols.forEach(c => forbidden.add(c));
    if (!cfg.isSuperAdmin) {
      for (const cols of Object.values(cfg.restrictedColumns ?? {})) cols.forEach(c => forbidden.add(c));
    }

    if (forbidden.size === 0 || !Array.isArray(rows)) return rows;

    let redactedCount = 0;

    const walk = (value: any, depth = 0): any => {
      if (value == null || depth > 6) return value;
      if (Array.isArray(value)) return value.map(v => walk(v, depth + 1));
      if (typeof value !== 'object' || value instanceof Date) return value;

      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        if (forbidden.has(k)) {
          redactedCount++;
          continue;
        }
        out[k] = walk(v, depth + 1);
      }
      return out;
    };

    const result = rows.map(r => walk(r));

    if (redactedCount > 0) {
      this.logger.log(`[RBAC] Redacted ${redactedCount} restricted field(s) for role ${role} on ${primaryTable}.`);
    }
    return result;
  }

  /** Human-readable summary, for the "access denied" reply and for debugging. */
  describeAccess(role: string | undefined): { role: string; tables: string | string[]; restricted: string[] } {
    const cfg = this.config(role);
    const restricted = new Set<string>();
    for (const [t, cols] of Object.entries(ALWAYS_REDACTED)) cols.forEach(c => restricted.add(`${t}.${c}`));
    if (!cfg.isSuperAdmin) {
      for (const [t, cols] of Object.entries(cfg.restrictedColumns ?? {})) cols.forEach(c => restricted.add(`${t}.${c}`));
    }
    return {
      role: role || 'unknown',
      tables: cfg.allowedTables === '*' ? 'all' : cfg.allowedTables,
      restricted: Array.from(restricted),
    };
  }
}

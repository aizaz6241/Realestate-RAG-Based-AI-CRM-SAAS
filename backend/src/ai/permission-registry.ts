import { Role } from '@prisma/client';

/**
 * Role-based access rules for the AI query pipeline.
 *
 * Replaces access checks that were hardcoded inline in three different places
 * (`validateAndOptimizeQuery`, `checkToolAuthorization`, and an ad-hoc salary check),
 * each with its own role list and no column- or row-level enforcement.
 *
 * ── Reconciled, not copied ────────────────────────────────────────────────────
 * Derived from the `ai-new` PermissionRegistry, whose *structure* is good but whose
 * *data* would have broken access on adoption. Notably it granted LOGISTICS only
 * ['User','Task','Property','CalendarEvent'] — omitting Vehicle, LogisticsSchedule and
 * VehicleMaintenance, the tables that role exists to work with, and which the live
 * pipeline explicitly allows. Its lists also predate ~20 tables now in the schema, so
 * default-deny against them would have silently blocked most queries.
 *
 * The rules below therefore preserve current effective table access and add the two
 * things genuinely missing: column-level redaction (salary, passwordHash) and
 * row-level scoping for AGENT.
 *
 * Table keys are lowercase to match SCHEMA_REGISTRY.
 */

/** Domain groupings, so roles are defined by responsibility rather than 44 literals. */
const TABLES = {
  core: ['organization', 'user'],

  hr: [
    'employeeprofile', 'employeedocument', 'attendance', 'leaverequest',
    'performancereview', 'activitylog',
  ],

  finance: [
    'payroll', 'subscription', 'subscriptionpayment', 'apiusagelog',
  ],

  sales: [
    'lead', 'leadactivity', 'client', 'clientcommunication',
    'clientpropertyinterest', 'clientviewing',
  ],

  property: [
    'property', 'propertypricehistory', 'owner', 'ownercommunication',
    'ownerdocument', 'keytracker', 'keycheckout',
  ],

  logistics: [
    'vehicle', 'vehiclemaintenance', 'logisticsschedule', 'driverprofile',
  ],

  workspace: [
    'task', 'calendarevent', 'document', 'documentversion',
    'chatroom', 'message',
  ],

  ai: [
    'aidocument', 'aidocumentchunk', 'aichatsession', 'aimemoryvector',
    'aipendingapproval', 'aiactivedraft',
  ],

  integrations: ['integrationconfig', 'integrationlog', 'communicationtemplate'],
} as const;

const group = (...keys: (keyof typeof TABLES)[]): string[] =>
  keys.flatMap(k => [...TABLES[k]]);

export interface RolePermissionConfig {
  /** Bypasses table restrictions. Column redaction in ALWAYS_REDACTED still applies. */
  isSuperAdmin?: boolean;
  /** Lowercase table keys this role may query. '*' means all. */
  allowedTables: string[] | '*';
  /** Columns stripped from results, keyed by lowercase table. */
  restrictedColumns?: Record<string, string[]>;
  /**
   * Row-level scoping merged into the Prisma `where` clause.
   * `'{userId}'` is substituted with the requesting user's id.
   */
  rowLevelSecurity?: Record<string, Record<string, any>>;
}

/**
 * Redacted for every role, including SUPER_ADMIN.
 * Credentials must never be reachable through a natural-language query.
 */
export const ALWAYS_REDACTED: Record<string, string[]> = {
  user: ['passwordHash'],
};

export const PermissionRegistry: Record<Role, RolePermissionConfig> = {
  SUPER_ADMIN: {
    isSuperAdmin: true,
    allowedTables: '*',
  },

  ADMIN: {
    allowedTables: '*',
  },

  FINANCE: {
    allowedTables: group('core', 'finance', 'hr', 'property', 'workspace', 'ai'),
  },

  HR: {
    allowedTables: group('core', 'hr', 'finance', 'workspace', 'ai'),
  },

  SALES_MANAGER: {
    allowedTables: group('core', 'sales', 'property', 'workspace', 'ai', 'hr'),
    restrictedColumns: {
      // Managers see their team, but not compensation.
      employeeprofile: ['salary'],
    },
  },

  AGENT: {
    allowedTables: group('core', 'sales', 'property', 'workspace', 'ai'),
    restrictedColumns: {
      employeeprofile: ['salary'],
    },
    rowLevelSecurity: {
      // An agent sees only their own book of work.
      task: { assignedToId: '{userId}' },
      lead: { assignedToId: '{userId}' },
      property: { assignedToId: '{userId}' },
    },
  },

  LOGISTICS: {
    // Includes the logistics tables the ai-new registry omitted — without them this
    // role cannot do its job, and the live pipeline already granted them.
    allowedTables: group('core', 'logistics', 'property', 'workspace', 'ai'),
  },

  RECEPTIONIST: {
    allowedTables: group('core', 'sales', 'workspace', 'ai'),
    restrictedColumns: {
      employeeprofile: ['salary'],
    },
  },

  VIEWER: {
    allowedTables: ['property', 'organization'],
    restrictedColumns: {
      property: ['ownerId'],
    },
  },
};

/**
 * Least-privileged fallback for an unknown or missing role, so a malformed JWT
 * fails closed rather than open.
 */
export function getRoleConfig(role: string | undefined): RolePermissionConfig {
  return PermissionRegistry[(role as Role)] ?? PermissionRegistry.VIEWER;
}

import { Role } from '@prisma/client';

export interface RolePermissionConfig {
  /** 
   * If true, this role can access all tables and columns, overriding all other restrictions.
   */
  isSuperAdmin?: boolean;

  /**
   * Tables this role is allowed to access. 
   * If a query tries to access a restricted table, the entire query is rejected.
   */
  allowedTables?: string[] | '*';

  /**
   * For allowed tables, columns that are restricted (e.g., salary, passwordHash).
   */
  restrictedColumns?: Record<string, string[]>;

  /**
   * Row-Level Security: SQL snippets or condition builders to append.
   */
  rowLevelSecurity?: Record<string, string>;
}

export const PermissionRegistry: Record<Role, RolePermissionConfig> = {
  SUPER_ADMIN: {
    isSuperAdmin: true,
  },
  ADMIN: {
    allowedTables: '*',
    restrictedColumns: {
      User: ['passwordHash'],
    },
    rowLevelSecurity: {}
  },
  FINANCE: {
    allowedTables: ['User', 'EmployeeProfile', 'Payroll', 'Transaction', 'Invoice', 'Subscription', 'SubscriptionPayment', 'Property'],
    restrictedColumns: {
      User: ['passwordHash'],
    },
    rowLevelSecurity: {}
  },
  HR: {
    allowedTables: ['User', 'EmployeeProfile', 'EmployeeDocument', 'Attendance', 'LeaveRequest', 'Payroll', 'Task', 'CalendarEvent'],
    restrictedColumns: {
      User: ['passwordHash'],
    },
    rowLevelSecurity: {}
  },
  SALES_MANAGER: {
    allowedTables: ['User', 'EmployeeProfile', 'Lead', 'Client', 'Property', 'Transaction', 'Task', 'CalendarEvent'],
    restrictedColumns: {
      User: ['passwordHash'],
      EmployeeProfile: ['salary'],
    },
    rowLevelSecurity: {}
  },
  AGENT: {
    allowedTables: ['User', 'EmployeeProfile', 'Lead', 'Client', 'Property', 'Transaction', 'Task', 'CalendarEvent'],
    restrictedColumns: {
      User: ['passwordHash'],
      EmployeeProfile: ['salary'],
    },
    rowLevelSecurity: {
      // Example of custom RLS: Agents can only see tasks assigned to them.
      // This will be processed by the validation layer.
      Task: 'Task.assignedToId = "{userId}"',
      Lead: 'Lead.assignedToId = "{userId}"',
    }
  },
  LOGISTICS: {
    allowedTables: ['User', 'Task', 'Property', 'CalendarEvent'],
    restrictedColumns: {
      User: ['passwordHash'],
    },
    rowLevelSecurity: {}
  },
  RECEPTIONIST: {
    allowedTables: ['User', 'Lead', 'Client', 'CalendarEvent', 'Task'],
    restrictedColumns: {
      User: ['passwordHash'],
    },
    rowLevelSecurity: {}
  },
  VIEWER: {
    allowedTables: ['Property', 'User'],
    restrictedColumns: {
      User: ['passwordHash'],
      Property: ['ownerId']
    },
    rowLevelSecurity: {}
  }
};

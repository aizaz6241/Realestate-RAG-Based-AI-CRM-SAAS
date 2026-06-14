import { Injectable, ForbiddenException } from '@nestjs/common';

export const TenantModelRegistry: Record<string, (orgId: string) => any> = {
  organization: (orgId) => ({ id: orgId }),
  user: (orgId) => ({ organizationId: orgId }),
  employeeprofile: (orgId) => ({ organizationId: orgId }),
  property: (orgId) => ({ organizationId: orgId }),
  lead: (orgId) => ({ organizationId: orgId }),
  client: (orgId) => ({ organizationId: orgId }),
  task: (orgId) => ({ organizationId: orgId }),
  owner: (orgId) => ({ organizationId: orgId }),
  document: (orgId) => ({ organizationId: orgId }),
  vehicle: (orgId) => ({ organizationId: orgId }),
  chatroom: (orgId) => ({ organizationId: orgId }),
  calendarevent: (orgId) => ({ organizationId: orgId }),
  aidocument: (orgId) => ({ organizationId: orgId }),
  aichatsession: (orgId) => ({ organizationId: orgId }),
  integrationconfig: (orgId) => ({ organizationId: orgId }),
  communicationtemplate: (orgId) => ({ organizationId: orgId }),
  integrationlog: (orgId) => ({ organizationId: orgId }),
  aimemoryvector: (orgId) => ({ organizationId: orgId }),
  subscription: (orgId) => ({ organizationId: orgId }),
  apiusagelog: (orgId) => ({ organizationId: orgId }),

  // Indirect relation models:
  employeedocument: (orgId) => ({ employeeProfile: { organizationId: orgId } }),
  attendance: (orgId) => ({ employeeProfile: { organizationId: orgId } }),
  leaverequest: (orgId) => ({ employeeProfile: { organizationId: orgId } }),
  activitylog: (orgId) => ({ employeeProfile: { organizationId: orgId } }),
  performancereview: (orgId) => ({ employeeProfile: { organizationId: orgId } }),
  payroll: (orgId) => ({ employeeProfile: { organizationId: orgId } }),
  driverprofile: (orgId) => ({ employeeProfile: { organizationId: orgId } }),
  ownercommunication: (orgId) => ({ owner: { organizationId: orgId } }),
  ownerdocument: (orgId) => ({ owner: { organizationId: orgId } }),
  clientpropertyinterest: (orgId) => ({ client: { organizationId: orgId } }),
  clientviewing: (orgId) => ({ client: { organizationId: orgId } }),
  clientcommunication: (orgId) => ({ client: { organizationId: orgId } }),
  propertypricehistory: (orgId) => ({ property: { organizationId: orgId } }),
  documentversion: (orgId) => ({ document: { organizationId: orgId } }),
  vehiclemaintenance: (orgId) => ({ vehicle: { organizationId: orgId } }),
  logisticsschedule: (orgId) => ({
    OR: [
      { vehicle: { organizationId: orgId } },
      { driver: { employeeProfile: { organizationId: orgId } } }
    ]
  }),
  keytracker: (orgId) => ({ property: { organizationId: orgId } }),
  keycheckout: (orgId) => ({ user: { organizationId: orgId } }),
  leadactivity: (orgId) => ({ lead: { organizationId: orgId } }),
  message: (orgId) => ({ chatRoom: { organizationId: orgId } }),
  aidocumentchunk: (orgId) => ({ aiDocument: { organizationId: orgId } }),
  subscriptionpayment: (orgId) => ({ subscription: { organizationId: orgId } })
};

const SECURITY_KEYS = new Set([
  'organizationid',
  'userid',
  'id',
  'tenantid',
  'ownerid',
  'createdby',
  'createdbyid',
  'assignedtoid',
  'employeeprofileid'
]);

@Injectable()
export class TenantIsolationService {
  
  assertTenantScope(organizationId: string): void {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim().length === 0) {
      throw new ForbiddenException('Security Rejection: Query executed without authorized organizationId scope.');
    }
  }

  isSecurityKey(key: string): boolean {
    return SECURITY_KEYS.has(key.toLowerCase().trim());
  }

  // Deep sanitize query filters: enforce strict equal comparison for security keys
  sanitizeSecurityFilters(filters: any): any {
    if (!filters || typeof filters !== 'object') return filters;

    const sanitized: any = Array.isArray(filters) ? [] : {};

    for (const key of Object.keys(filters)) {
      const val = filters[key];

      if (this.isSecurityKey(key)) {
        // Enforce STRICT EQUALS ONLY. Reject contains, fuzzy, wildcard, mode: insensitive, etc.
        if (typeof val === 'object' && val !== null) {
          if (val.equals !== undefined) {
            sanitized[key] = val.equals;
          } else {
            // Drop complex queries on security keys
            throw new ForbiddenException(`Security Rejection: Wildcard / operator queries on security key "${key}" are forbidden.`);
          }
        } else {
          sanitized[key] = val;
        }
      } else {
        // Recurse into nested objects/arrays
        if (typeof val === 'object' && val !== null) {
          sanitized[key] = this.sanitizeSecurityFilters(val);
        } else {
          sanitized[key] = val;
        }
      }
    }
    return sanitized;
  }

  injectTenantFilter(modelName: string, baseWhere: any, organizationId: string): any {
    this.assertTenantScope(organizationId);

    const modelKey = modelName.toLowerCase().trim();
    const filterBuilder = TenantModelRegistry[modelKey];

    if (!filterBuilder) {
      throw new ForbiddenException(`Security Rejection: Unregistered model "${modelName}" cannot be accessed securely.`);
    }

    const tenantFilter = filterBuilder(organizationId);
    
    // First sanitize security filters provided by the query planner/LLM
    const cleanWhere = this.sanitizeSecurityFilters(baseWhere || {});

    // Force-inject/overwrite tenant filter at root
    const merged = { ...cleanWhere };

    for (const key of Object.keys(tenantFilter)) {
      merged[key] = tenantFilter[key]; // Explicit assignment blocks overwrite
    }

    return merged;
  }
}

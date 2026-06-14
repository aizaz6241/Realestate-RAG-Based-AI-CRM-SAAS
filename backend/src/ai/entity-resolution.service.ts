import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EntityResolutionService {
  private readonly logger = new Logger(EntityResolutionService.name);

  resolveEntities(rows: any[]): any[] {
    if (!rows || !Array.isArray(rows) || rows.length === 0) return rows;

    this.logger.log(`[Entity Resolution Service] Running cross-model identity resolution on ${rows.length} rows.`);

    const resolved: any[] = [];
    const profilesMap = new Map<string, any>(); // Map of userId -> employeeProfile record
    const usersMap = new Map<string, any>();    // Map of userId -> user record
    const generalMap = new Map<string, any>();  // Map of primary key ID -> unified record

    // First pass: categorize and index records
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        resolved.push(row);
        continue;
      }

      // Check if it's an EmployeeProfile (contains userId, designation, etc.)
      const isProfile = row.userId !== undefined && row.designation !== undefined;
      // Check if it's a User (contains email, firstName, but no designation/salary at root)
      const isUser = row.email !== undefined && row.designation === undefined && row.salary === undefined;

      const rowId = row.id;

      if (isProfile) {
        profilesMap.set(row.userId, row);
      } else if (isUser) {
        usersMap.set(rowId, row);
      } else {
        if (rowId) {
          generalMap.set(rowId, row);
        } else {
          resolved.push(row);
        }
      }
    }

    // Second pass: resolve and merge User + EmployeeProfile
    // If we have an EmployeeProfile for a userId, and also a raw User row for the same userId, we merge them!
    const processedUserIds = new Set<string>();

    for (const [userId, profile] of profilesMap.entries()) {
      const userRecord = usersMap.get(userId) || profile.user;
      
      const mergedEntity = {
        id: profile.id,
        userId: userId,
        firstName: profile.firstName || userRecord?.firstName || 'Employee',
        lastName: profile.lastName || userRecord?.lastName || '',
        email: profile.email || userRecord?.email || '',
        role: profile.role || userRecord?.role || 'AGENT',
        department: profile.department || null,
        designation: profile.designation || null,
        salary: profile.salary !== undefined ? profile.salary : userRecord?.salary,
        status: profile.status || 'ACTIVE',
        organizationId: profile.organizationId || userRecord?.organizationId,
        createdAt: profile.createdAt || userRecord?.createdAt
      };

      resolved.push(mergedEntity);
      processedUserIds.add(userId);
    }

    // Add any Users that did NOT have an associated EmployeeProfile
    for (const [userId, user] of usersMap.entries()) {
      if (!processedUserIds.has(userId)) {
        resolved.push(user);
      }
    }

    // Add general/other entity types
    for (const other of generalMap.values()) {
      resolved.push(other);
    }

    this.logger.log(`[Entity Resolution Service] Resolved and deduplicated results down to ${resolved.length} rows.`);
    return resolved;
  }
}

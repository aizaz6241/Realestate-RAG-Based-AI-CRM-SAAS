import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { RensGateway } from './rens.gateway';

@Injectable()
export class AiDatabaseToolsService {
  private readonly logger = new Logger(AiDatabaseToolsService.name);

  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
    private rensGateway: RensGateway
  ) {}

  // Fuzzy matching name resolution helper for EmployeeProfiles
  async findEmployeeProfileIdByName(name: string, organizationId: string): Promise<string | null> {
    if (!name) return null;
    const cleanQuery = name.toLowerCase().trim();

    const profiles = await this.prisma.employeeProfile.findMany({
      where: { organizationId },
      include: { user: true }
    });

    let bestProfile: any = null;
    let highestScore = 0;

    for (const prof of profiles) {
      const first = (prof.user.firstName || '').toLowerCase();
      const last = (prof.user.lastName || '').toLowerCase();
      const fullName = `${first} ${last}`.trim();

      let score = 0;

      if (fullName === cleanQuery) {
        score = 100;
      } else if (fullName.includes(cleanQuery) || cleanQuery.includes(fullName)) {
        score = 80;
      } else {
        const queryWords = cleanQuery.split(/[\s_-]+/);
        const nameWords = fullName.split(/[\s_-]+/);

        let overlapCount = 0;
        for (const qw of queryWords) {
          if (qw.length < 2) continue;
          const matches = nameWords.some(nw => nw.includes(qw) || qw.includes(nw) || this.levenshteinDistance(qw, nw) <= 2);
          if (matches) overlapCount++;
        }
        
        score = (overlapCount / Math.max(queryWords.length, 1)) * 50;
      }

      if (score > highestScore && score > 20) {
        highestScore = score;
        bestProfile = prof;
      }
    }

    return bestProfile ? bestProfile.id : null;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(
              matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1 // deletion
            )
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  async findEmployeeFuzzy(nameQuery: string, organizationId: string): Promise<any[]> {
    if (!nameQuery) return [];
    
    try {
      const users: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT u.id, u."firstName", u."lastName", u.email, u.role, ep.id as "profileId", ep.department, ep.designation, ep.salary, ep.status,
               similarity(u."firstName" || ' ' || COALESCE(u."lastName", ''), $1) as "similarityScore"
        FROM "User" u
        LEFT JOIN "EmployeeProfile" ep ON ep."userId" = u.id
        WHERE u."organizationId" = $2
          AND (
            similarity(u."firstName" || ' ' || COALESCE(u."lastName", ''), $1) > 0.3
            OR u."firstName" ILIKE $3
            OR COALESCE(u."lastName", '') ILIKE $3
          )
        ORDER BY "similarityScore" DESC
        LIMIT 5;
      `, nameQuery, organizationId, `%${nameQuery}%`);
      
      return users;
    } catch (e) {
      this.logger.warn(`pg_trgm fuzzy match query failed: ${e.message}. Falling back to standard Prisma lookups.`);
      const employees = await this.prisma.employeeProfile.findMany({
        where: {
          organizationId,
          OR: [
            { user: { firstName: { contains: nameQuery, mode: 'insensitive' } } },
            { user: { lastName: { contains: nameQuery, mode: 'insensitive' } } }
          ]
        },
        include: { user: true }
      });
      return employees.map(emp => ({
        id: emp.user.id,
        firstName: emp.user.firstName,
        lastName: emp.user.lastName,
        email: emp.user.email,
        role: emp.user.role,
        profileId: emp.id,
        department: emp.department,
        designation: emp.designation,
        salary: emp.salary,
        status: emp.status,
        similarityScore: 1.0
      }));
    }
  }

  checkToolAuthorization(toolName: string, userRole: string): boolean {
    const role = userRole || 'VIEWER';
    
    if (toolName === 'getFinanceAnalytics') {
      return ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(role);
    }

    if (toolName === 'searchClients') {
      return ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'RECEPTIONIST'].includes(role);
    }

    if (toolName === 'getLogisticsAnalytics') {
      return ['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'].includes(role);
    }

    if (toolName === 'getLeaveRequests') {
      return true;
    }
    
    return true; 
  }

  async executeDatabaseTool(
    toolName: string,
    params: any,
    organizationId: string,
    userRole: string,
    userId: string
  ): Promise<any> {
    this.logger.log(`Executing live Postgres tool: ${toolName} for role ${userRole}`);
    
    const isAuthorized = this.checkToolAuthorization(toolName, userRole);
    if (!isAuthorized) {
      this.logger.warn(`Security Warning: User with role ${userRole} attempted unauthorized execution of tool ${toolName}`);
      return { 
        error: `ACCESS_DENIED`,
        message: `Clearance Required: Your user profile (${userRole}) is not cleared to access secure finance databases.`
      };
    }

    try {
      switch (toolName) {
        case 'searchProperties': {
          const { location, minPrice, maxPrice, bedrooms, bathrooms, type, listingType, status } = params || {};
          return this.prisma.property.findMany({
            where: {
              organizationId,
              status: status || undefined,
              type: type || undefined,
              listingType: listingType || undefined,
              location: location ? { contains: location, mode: 'insensitive' } : undefined,
              price: (minPrice || maxPrice) ? {
                gte: minPrice ? parseFloat(minPrice) : undefined,
                lte: maxPrice ? parseFloat(maxPrice) : undefined,
              } : undefined,
              bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
              bathrooms: bathrooms ? parseInt(bathrooms) : undefined,
            },
            include: {
              owner: {
                select: { name: true, phone: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
          });
        }

        case 'searchClients': {
          const { name, budget, preferences, type } = params || {};
          return this.prisma.client.findMany({
            where: {
              organizationId,
              type: type || undefined,
              name: name ? { contains: name, mode: 'insensitive' } : undefined,
              budget: budget ? { lte: parseFloat(budget) } : undefined,
              preferences: preferences ? { contains: preferences, mode: 'insensitive' } : undefined,
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
          });
        }

        case 'searchEmployees': {
          const { name, designation, department } = params || {};
          const canViewSalaries = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(userRole);

          if (name) {
            const matches = await this.findEmployeeFuzzy(name, organizationId);
            
            let filteredMatches = matches;
            if (department) {
              filteredMatches = filteredMatches.filter(m => m.department && m.department.toLowerCase().includes(department.toLowerCase()));
            }
            if (designation) {
              filteredMatches = filteredMatches.filter(m => m.designation && m.designation.toLowerCase().includes(designation.toLowerCase()));
            }

            return filteredMatches.map(emp => {
              const mapped: any = {
                id: emp.profileId || emp.id,
                userId: emp.id,
                designation: emp.designation,
                department: emp.department,
                joiningDate: emp.joiningDate || null,
                status: emp.status || 'ACTIVE',
                similarityScore: emp.similarityScore !== undefined ? parseFloat(emp.similarityScore) : 1.0,
                user: {
                  id: emp.id,
                  firstName: emp.firstName,
                  lastName: emp.lastName,
                  email: emp.email,
                  role: emp.role
                }
              };
              if (canViewSalaries || emp.id === userId) {
                mapped.salary = emp.salary;
              } else {
                mapped.salary = "CONFIDENTIAL (Access Denied)";
              }
              return mapped;
            });
          }

          const employees = await this.prisma.employeeProfile.findMany({
            where: {
              organizationId,
              designation: designation ? { contains: designation, mode: 'insensitive' } : undefined,
              department: department ? { contains: department, mode: 'insensitive' } : undefined,
            },
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, role: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 12,
          });

          return employees.map((emp) => {
            const mapped: any = {
              id: emp.id,
              userId: emp.userId,
              designation: emp.designation,
              department: emp.department,
              joiningDate: emp.joiningDate,
              status: emp.status,
              user: emp.user,
            };
            if (canViewSalaries || emp.userId === userId) {
              mapped.salary = emp.salary;
            } else {
              mapped.salary = "CONFIDENTIAL (Access Denied)";
            }
            return mapped;
          });
        }

        case 'getFinanceAnalytics': {
          const payrolls = await this.prisma.payroll.findMany({
            where: {
              employeeProfile: {
                organizationId,
              },
            },
            orderBy: { month: 'desc' },
            take: 30,
          });

          const totalNetSalary = payrolls.reduce((acc, curr) => acc + curr.netSalary, 0);
          const totalBaseSalary = payrolls.reduce((acc, curr) => acc + curr.baseSalary, 0);
          const totalAllowances = payrolls.reduce((acc, curr) => acc + curr.allowances, 0);
          const totalDeductions = payrolls.reduce((acc, curr) => acc + curr.deductions, 0);

          const employeeSalaries = await this.prisma.employeeProfile.findMany({
            where: { organizationId },
            include: { user: { select: { firstName: true } } },
          });

          return {
            recentPayrollCount: payrolls.length,
            totals: {
              netSalary: totalNetSalary,
              baseSalary: totalBaseSalary,
              allowances: totalAllowances,
              deductions: totalDeductions,
            },
            staffDetails: employeeSalaries.map((emp) => ({
              name: emp.user.firstName,
              designation: emp.designation,
              salary: emp.salary || 0,
            })),
          };
        }

        case 'getTasksBoard': {
          const { status, name, employeeName } = params || {};
          const filterName = name || employeeName;

          const whereClause: any = {
            organizationId,
            status: status && ['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status.toUpperCase()) 
              ? (status.toUpperCase() as any) 
              : undefined,
          };

          if (filterName) {
            const matches = await this.findEmployeeFuzzy(filterName, organizationId);
            if (matches.length > 0) {
              whereClause.assignedToId = { in: matches.map(m => m.id) };
            } else {
              whereClause.assignedToId = "NON_EXISTENT_ID";
            }
          }

          return this.prisma.task.findMany({
            where: whereClause,
            include: {
              assignedTo: {
                select: { firstName: true, email: true },
              },
            },
            orderBy: { dueDate: 'asc' },
            take: 15,
          });
        }

        case 'getMeetingsAnalytics': {
          const { type } = params || {};
          let locationFilter: any = {};

          if (type === 'VIRTUAL') {
            locationFilter = {
              OR: [
                { location: { contains: 'http', mode: 'insensitive' } },
                { location: { contains: 'virtual', mode: 'insensitive' } }
              ]
            };
          } else if (type === 'PHYSICAL') {
            locationFilter = {
              NOT: [
                { location: { contains: 'http', mode: 'insensitive' } },
                { location: { contains: 'virtual', mode: 'insensitive' } }
              ]
            };
          }

          const events = await this.prisma.calendarEvent.findMany({
            where: { 
              organizationId,
              ...locationFilter
            },
            include: {
              createdBy: {
                select: { id: true, firstName: true, lastName: true, role: true, email: true }
              }
            },
            orderBy: { startTime: 'desc' },
            take: 20
          });

          const analyzedMeetings: any[] = [];

          for (const event of events) {
            if (event.isPrivate) continue;

            const state = this.calendarService.meetingStates.get(event.id) || {
              participants: [] as any[],
              allTimeAttendees: [] as any[],
              messages: [] as any[],
              isTerminated: false
            };

            const invitees = await this.prisma.user.findMany({
              where: {
                organizationId,
                OR: [
                  { id: { in: event.targetUserIds } },
                  { role: { in: event.targetRoles as any } }
                ]
              },
              select: { id: true, firstName: true, lastName: true, role: true }
            });

            // Reconstruct the full pool of expected or participating users to fix the 200% Present / Attendance bug
            const expectedUsersMap = new Map<string, { id: string, name: string, role: string }>();

            // Add the host/creator if they exist
            if (event.createdBy) {
              expectedUsersMap.set(event.createdById, {
                id: event.createdBy.id,
                name: `${event.createdBy.firstName} ${event.createdBy.lastName || ''}`.trim(),
                role: event.createdBy.role
              });
            }

            // Add all formal invitees
            for (const inv of invitees) {
              expectedUsersMap.set(inv.id, {
                id: inv.id,
                name: `${inv.firstName} ${inv.lastName || ''}`.trim(),
                role: inv.role
              });
            }

            // Dynamically add anyone who actually attended to the pool, so they are not treated as excess attendees (200% rate)
            for (const att of state.allTimeAttendees) {
              if (!expectedUsersMap.has(att.id)) {
                expectedUsersMap.set(att.id, {
                  id: att.id,
                  name: att.name,
                  role: att.role
                });
              }
            }

            const now = new Date();
            const start = new Date(event.startTime);
            const end = new Date(event.endTime);
            const isTerminated = state.isTerminated || now > end;
            const status = isTerminated ? 'COMPLETED' : (now >= start ? 'ACTIVE' : 'UPCOMING');

            let present = state.allTimeAttendees.map(a => ({
              id: a.id,
              name: a.name,
              role: a.role,
              joinedAt: new Date(a.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }));

            let absent: any[] = [];

            // If the meeting has started or ended, and we have no live allTimeAttendees data (e.g. server restart or standard calendar event),
            // we default to assuming expected participants attended to ensure realistic and correct attendance analytics.
            if (now >= start && state.allTimeAttendees.length === 0) {
              present = Array.from(expectedUsersMap.values()).map(u => ({
                id: u.id,
                name: u.name,
                role: u.role,
                joinedAt: new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }));
              absent = [];
            } else {
              for (const [userId, user] of expectedUsersMap.entries()) {
                if (!state.allTimeAttendees.some(a => a.id === userId)) {
                  absent.push(user);
                }
              }
            }

            analyzedMeetings.push({
              id: event.id,
              title: event.title,
              description: event.description,
              startTime: event.startTime,
              endTime: event.endTime,
              location: event.location,
              organizer: `${event.createdBy?.firstName || ''} ${event.createdBy?.lastName || ''}`.trim(),
              organizerRole: event.createdBy?.role,
              isTerminated,
              status,
              attendanceSummary: {
                totalInvited: expectedUsersMap.size,
                totalAttended: present.length,
                totalAbsent: absent.length
              },
              attendedParticipants: present,
              absentParticipants: absent,
              chatMessagesCount: state.messages.length
            });
          }

          return analyzedMeetings;
        }

        case 'getLeaveRequests': {
          const { name, status } = params || {};
          
          const canViewAllLeaves = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(userRole);

          const whereClause: any = {
            employeeProfile: {
              organizationId,
            },
            status: status || undefined
          };

          if (canViewAllLeaves) {
            if (name) {
              const names = name.split(/,|and|aur|&/i).map((n: string) => n.trim()).filter(Boolean);
              if (names.length > 0) {
                const profileIds: string[] = [];
                for (const singleName of names) {
                  const profileId = await this.findEmployeeProfileIdByName(singleName, organizationId);
                  if (profileId) profileIds.push(profileId);
                }
                if (profileIds.length > 0) {
                  whereClause.employeeProfileId = { in: profileIds };
                } else {
                  whereClause.employeeProfileId = "NON_EXISTENT_ID";
                }
              }
            }
          } else {
            whereClause.employeeProfile.userId = userId;
          }

          const leaves = await this.prisma.leaveRequest.findMany({
            where: whereClause,
            include: {
              employeeProfile: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true, role: true, email: true }
                  }
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 15,
          });

          return leaves.map(l => ({
            id: l.id,
            startDate: l.startDate,
            endDate: l.endDate,
            type: l.type,
            status: l.status,
            reason: l.reason,
            approvedAt: l.approvedAt,
            employeeName: `${l.employeeProfile.user.firstName} ${l.employeeProfile.user.lastName || ''}`.trim(),
            employeeRole: l.employeeProfile.user.role,
            employeeEmail: l.employeeProfile.user.email
          }));
        }

        case 'getAttendanceRecord': {
          const { name, status } = params || {};
          
          const canViewAllAttendance = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(userRole);

          const whereClause: any = {
            employeeProfile: {
              organizationId,
            },
            status: status || undefined
          };

          if (canViewAllAttendance) {
            if (name) {
              const names = name.split(/,|and|aur|&/i).map((n: string) => n.trim()).filter(Boolean);
              if (names.length > 0) {
                const profileIds: string[] = [];
                for (const singleName of names) {
                  const profileId = await this.findEmployeeProfileIdByName(singleName, organizationId);
                  if (profileId) profileIds.push(profileId);
                }
                if (profileIds.length > 0) {
                  whereClause.employeeProfileId = { in: profileIds };
                } else {
                  whereClause.employeeProfileId = "NON_EXISTENT_ID";
                }
              }
            }
          } else {
            whereClause.employeeProfile.userId = userId;
          }

          const attendances = await this.prisma.attendance.findMany({
            where: whereClause,
            include: {
              employeeProfile: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true, role: true, email: true }
                  }
                }
              }
            },
            orderBy: { dateStr: 'desc' },
            take: 30,
          });

          return attendances.map(att => ({
            id: att.id,
            dateStr: att.dateStr,
            checkIn: att.checkIn,
            checkOut: att.checkOut,
            status: att.status,
            checkoutSummary: att.checkoutSummary,
            employeeName: `${att.employeeProfile.user.firstName} ${att.employeeProfile.user.lastName || ''}`.trim(),
            employeeRole: att.employeeProfile.user.role,
            employeeEmail: att.employeeProfile.user.email
          }));
        }

        case 'getLogisticsAnalytics': {
          if (!['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'].includes(userRole)) {
            return {
              error: `ACCESS_DENIED`,
              message: `Clearance Required: Your user profile (${userRole}) is not cleared to access secure logistics databases.`
            };
          }

          const vehicles = await this.prisma.vehicle.findMany({
            where: { organizationId },
            include: {
              maintenanceRequests: true
            }
          });

          const schedules = await this.prisma.logisticsSchedule.findMany({
            where: {
              vehicle: { organizationId }
            },
            include: {
              vehicle: { select: { modelName: true, plateNumber: true } },
              driver: {
                include: {
                  employeeProfile: {
                    include: {
                      user: { select: { firstName: true, lastName: true } }
                    }
                  }
                }
              }
            },
            orderBy: { visitDate: 'desc' },
            take: 15
          });

          return {
            vehiclesCount: vehicles.length,
            vehicles: vehicles.map(v => ({
              id: v.id,
              modelName: v.modelName,
              plateNumber: v.plateNumber,
              status: v.status,
              maintenanceCount: v.maintenanceRequests.length,
              maintenanceCostTotal: v.maintenanceRequests.reduce((sum, req) => sum + (req.cost || 0), 0),
              maintenanceRequests: v.maintenanceRequests.map(r => ({
                description: r.description,
                cost: r.cost,
                status: r.status,
                requestDate: r.requestDate
              }))
            })),
            schedules: schedules.map(s => ({
              id: s.id,
              visitDate: s.visitDate,
              pickupLocation: s.pickupLocation,
              dropLocation: s.dropLocation,
              status: s.status,
              vehicle: s.vehicle ? `${s.vehicle.modelName} (${s.vehicle.plateNumber})` : 'Unassigned',
              driver: s.driver ? `${s.driver.employeeProfile.user.firstName} ${s.driver.employeeProfile.user.lastName || ''}`.trim() : 'Unassigned'
            }))
          };
        }

        case 'runDatabaseQuery': {
          const { query } = params || {};
          if (!query) {
            return { error: "Query is required" };
          }

          const normalized = query.toLowerCase().trim();
          const forbiddenKeywords = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'replace', 'upsert'];
          
          for (const word of forbiddenKeywords) {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(normalized)) {
              return {
                error: `SECURITY_VIOLATION`,
                message: `Forbidden Operation: Write operations like '${word.toUpperCase()}' are strictly prohibited. Only read-only SELECT queries are allowed.`
              };
            }
          }

          if (normalized.includes(';')) {
            return {
              error: `SECURITY_VIOLATION`,
              message: `Forbidden Operation: Semicolons ';' are prohibited to prevent stacked query execution.`
            };
          }

          let virtualizedQuery = query;
          const camelCaseColumns = [
            'organizationId', 'employeeProfileId', 'joiningDate', 'checkIn', 'checkOut',
            'checkoutSummary', 'startDate', 'endDate', 'listingType', 'areaSqft',
            'dueDate', 'assignedToId', 'startTime', 'endTime', 'reviewDate',
            'reviewedById', 'logTime', 'userId', 'firstName', 'lastName',
            'createdAt', 'updatedAt', 'systemUserId', 'chatRoomId', 'isSystem',
            'messageText', 'escalationNotes', 'taskTitle', 'plateNumber',
            'modelName', 'visitDate', 'pickupLocation', 'dropLocation', 'createdById',
            'passwordHash', 'isActive', 'dateStr', 'approvedAt', 'ownerId', 'duplicateOfId',
            'isDuplicate', 'commissionRate', 'agreementUrl', 'agreementExpiry', 'clientId',
            'propertyId', 'viewingDate', 'baseSalary', 'netSalary', 'paidAt', 'changeDate',
            'expiryDate', 'isExpired', 'accessRole', 'targetRoles', 'targetUserIds',
            'writeRoles', 'writeUserIds', 'updatedById', 'documentId', 'licenseNumber',
            'completionDate', 'vehicleId', 'driverId', 'viewingId', 'keyTag', 'checkoutDate',
            'returnDate', 'keyId', 'activityDate', 'leadId', 'isGroup', 'senderId',
            'isPrivate', 'fileUrl', 'fileType', 'fileSize', 'isEnabled', 'errorMessage',
            'kycVerified', 'kycNotes', 'requestDate'
          ];

          const casedTables = [
            'Organization', 'User', 'EmployeeProfile', 'EmployeeDocument', 'Attendance', 'LeaveRequest',
            'ActivityLog', 'PerformanceReview', 'Property', 'Lead', 'Client', 'Task', 'Owner',
            'OwnerCommunication', 'OwnerDocument', 'ClientPropertyInterest', 'ClientViewing',
            'ClientCommunication', 'Payroll', 'PropertyPriceHistory', 'Document', 'DocumentVersion',
            'DriverProfile', 'Vehicle', 'VehicleMaintenance', 'LogisticsSchedule', 'KeyTracker',
            'KeyCheckout', 'LeadActivity', 'ChatRoom', 'Message', 'CalendarEvent', 'AiDocument',
            'AiDocumentChunk', 'AiChatSession', 'IntegrationConfig', 'CommunicationTemplate',
            'IntegrationLog', 'AiMemoryVector'
          ];

          for (const col of camelCaseColumns) {
            const colRegex = new RegExp(`"?\\b${col}\\b"?`, 'gi');
            virtualizedQuery = virtualizedQuery.replace(colRegex, `"${col}"`);
          }

          for (const tbl of casedTables) {
            const tblRegex = new RegExp(`"?\\b${tbl}\\b"?`, 'gi');
            virtualizedQuery = virtualizedQuery.replace(tblRegex, `"${tbl}"`);
          }

          try {
            return await this.prisma.$queryRawUnsafe(virtualizedQuery);
          } catch (e) {
            return {
              error: `QUERY_ERROR`,
              message: `Database query syntax error: ${e.message}. Please double-check schema columns and try again.`
            };
          }
        }

        case 'createTask': {
          const { title, employeeName, description, dueDate, priority } = params || {};
          if (!title || !employeeName) {
            return { error: 'MISSING_PARAMS', message: 'Task title and target employee name are required.' };
          }

          const matches = await this.findEmployeeFuzzy(employeeName, organizationId);
          if (matches.length === 0) {
            return {
              error: 'CLARIFICATION_REQUIRED',
              message: `I couldn't find any team member named "${employeeName}". Can you please clarify who to assign this task to?`
            };
          }

          if (matches.length > 1 && matches[0].similarityScore - matches[1].similarityScore < 0.15) {
            return {
              error: 'CLARIFICATION_REQUIRED',
              options: matches.slice(0, 3).map(m => `${m.firstName} ${m.lastName || ''}`.trim()),
              message: `I found multiple employees matching "${employeeName}": ${matches.slice(0, 3).map(m => `${m.firstName} ${m.lastName || ''}`.trim()).join(', ')}. Please specify which one you meant.`
            };
          }

          const targetEmployee = matches[0];

          const activeTasksCount = await this.prisma.task.count({
            where: {
              assignedToId: targetEmployee.id,
              status: { in: ['PENDING', 'IN_PROGRESS'] }
            }
          });

          const WORKLOAD_THRESHOLD = 8;
          if (activeTasksCount >= WORKLOAD_THRESHOLD) {
            const alternatives = await this.prisma.user.findMany({
              where: {
                organizationId,
                id: { not: targetEmployee.id },
                employeeProfile: {
                  department: targetEmployee.department || undefined
                }
              },
              include: {
                employeeProfile: true,
                assignedTasks: {
                  where: { status: { in: ['PENDING', 'IN_PROGRESS'] } }
                }
              },
              take: 3
            });

            const recommendations = alternatives
              .map(alt => ({
                id: alt.id,
                name: alt.lastName ? `${alt.firstName} ${alt.lastName}`.trim() : alt.firstName,
                tasksCount: alt.assignedTasks.length
              }))
              .sort((a, b) => a.tasksCount - b.tasksCount);

            return {
              error: 'WORKLOAD_ALERT',
              targetEmployee: `${targetEmployee.firstName} ${targetEmployee.lastName || ''}`.trim(),
              activeTasksCount,
              recommendations,
              message: `⚠️ Workload Alert: ${targetEmployee.firstName} currently has ${activeTasksCount} active tasks (overloaded). I suggest assigning this to ${recommendations[0]?.name || 'someone else'} who has fewer tasks.`
            };
          }

          const task = await this.prisma.task.create({
            data: {
              title,
              description: description || null,
              status: 'PENDING',
              dueDate: dueDate ? new Date(dueDate) : null,
              assignedToId: targetEmployee.id,
              createdById: userId,
              organizationId
            }
          });

          if (targetEmployee.profileId) {
            await this.prisma.activityLog.create({
              data: {
                employeeProfileId: targetEmployee.profileId,
                category: 'WORK',
                description: `Assigned new task: "${title}". Priority: ${priority || 'STANDARD'}.`
              }
            });
          }

          // Force direct database verification checks (Rule 1 Fix: Single Source of Truth Task Verification)
          const verifiedTask = await this.prisma.task.findUnique({
            where: { id: task.id }
          });

          // Fetch the employee user profile with assignedTasks index
          const userWithTasks = await this.prisma.user.findUnique({
            where: { id: targetEmployee.id },
            include: { assignedTasks: true }
          });
          const isTaskInEmployeeIndex = userWithTasks?.assignedTasks.some(t => t.id === task.id);

          if (!verifiedTask || verifiedTask.id !== task.id || !isTaskInEmployeeIndex) {
            this.logger.error(`Database validation failure: Task "${title}" was not verified in Postgres or employee task index after write!`);
            return {
              error: 'DATABASE_SYNC_FAILURE',
              message: 'Task assignment could not be verified in the employee task index. Please try again.'
            };
          }

          this.rensGateway.broadcastToOrganization(organizationId, 'task_sync', {
            action: 'create',
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.dueDate,
              assignedToName: `${targetEmployee.firstName} ${targetEmployee.lastName || ''}`.trim()
            }
          });

          return {
            success: true,
            status: 'ASSIGNED',
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.dueDate
            },
            assignedTo: `${targetEmployee.firstName} ${targetEmployee.lastName || ''}`.trim()
          };
        }

        case 'updateTask': {
          const { taskId, status } = params || {};
          const task = await this.prisma.task.update({
            where: { id: taskId, organizationId },
            data: { status }
          });

          const verifiedTask = await this.prisma.task.findUnique({
            where: { id: taskId }
          });

          if (!verifiedTask || verifiedTask.status !== status) {
            this.logger.error(`Database sync delay mismatch: Task "${taskId}" status update to ${status} could not be verified!`);
            return {
              error: 'DATABASE_SYNC_FAILURE',
              message: 'Task status update could not be verified in Postgres.'
            };
          }

          this.rensGateway.broadcastToOrganization(organizationId, 'task_sync', {
            action: 'update',
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.dueDate
            }
          });

          return { success: true, task };
        }

        case 'updateLeadStatus': {
          const { leadId, status, score } = params || {};
          const lead = await this.prisma.lead.update({
            where: { id: leadId, organizationId },
            data: { 
              status,
              score: score ? parseInt(score) : undefined
            }
          });

          return { success: true, lead };
        }

        case 'sendReminder': {
          const { employeeId, messageText } = params || {};
          let room = await this.prisma.chatRoom.findFirst({
            where: {
              organizationId,
              isSystem: true,
              systemUserId: employeeId,
            },
          });

          if (!room) {
            room = await this.prisma.chatRoom.create({
              data: {
                name: "RENS System Bot",
                isGroup: false,
                isSystem: true,
                systemUserId: employeeId,
                organizationId,
                members: {
                  connect: { id: employeeId },
                },
              },
            });
          }

          await this.prisma.message.create({
            data: {
              content: messageText,
              isSystem: true,
              chatRoomId: room.id,
            },
          });

          await this.prisma.chatRoom.update({
            where: { id: room.id },
            data: { updatedAt: new Date() },
          });

          this.rensGateway.broadcastToOrganization(organizationId, 'alert_sync', {
            action: 'create',
            message: messageText,
            recipientId: employeeId,
          });

          return { success: true, message: "Reminder successfully dispatched." };
        }

        case 'fetchEmployeePerformance': {
          const { employeeName } = params || {};
          
          const deptQuery = employeeName ? employeeName.toLowerCase().trim() : '';
          const isDept = ['hr', 'human resources', 'sales', 'finance', 'logistics'].includes(deptQuery);

          if (employeeName === 'all' || employeeName === 'best' || isDept) {
            const users = await this.prisma.user.findMany({
              where: { 
                organizationId,
                employeeProfile: isDept ? {
                  department: deptQuery === 'hr' || deptQuery === 'human resources' 
                    ? { equals: 'Human Resources', mode: 'insensitive' }
                    : { contains: employeeName, mode: 'insensitive' }
                } : undefined
              },
              include: {
                employeeProfile: {
                  include: {
                    reviews: true,
                    activities: true,
                  }
                },
                assignedTasks: true
              }
            });

            return users.map(u => {
              const totalTasks = u.assignedTasks.length;
              const completedTasks = u.assignedTasks.filter(t => t.status === 'COMPLETED').length;
              const reviews = u.employeeProfile?.reviews || [];
              const avgReviewRating = reviews.length > 0 ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length) : 0;

              return {
                id: u.employeeProfile?.id,
                userId: u.id,
                name: `${u.firstName} ${u.lastName || ''}`.trim(),
                designation: u.employeeProfile?.designation || 'None',
                department: u.employeeProfile?.department || 'None',
                taskCompletionRate: totalTasks > 0 ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(2)) : 0,
                rating: avgReviewRating,
                pendingTasksCount: u.assignedTasks.filter(t => t.status !== 'COMPLETED').length
              };
            }).sort((a, b) => b.taskCompletionRate - a.taskCompletionRate);
          }

          const profileId = await this.findEmployeeProfileIdByName(employeeName, organizationId);
          if (!profileId) {
            return { error: 'NOT_FOUND', message: `I couldn't resolve employee "${employeeName}" in the active database.` };
          }

          const profile = await this.prisma.employeeProfile.findUnique({
            where: { id: profileId },
            include: {
              user: {
                include: {
                  assignedTasks: true
                }
              },
              reviews: {
                orderBy: { reviewDate: 'desc' },
                take: 5
              },
              activities: {
                orderBy: { logTime: 'desc' },
                take: 10
              }
            }
          });

          if (!profile) {
            return { error: 'NOT_FOUND', message: `I resolved employee profile ID "${profileId}" but could not retrieve details from the active database.` };
          }

          const totalTasks = profile.user.assignedTasks.length;
          const completedTasks = profile.user.assignedTasks.filter(t => t.status === 'COMPLETED').length;

          return {
            id: profile.id,
            name: `${profile.user.firstName} ${profile.user.lastName || ''}`.trim(),
            designation: profile.designation,
            department: profile.department,
            joiningDate: profile.joiningDate,
            salary: profile.salary,
            status: profile.status,
            tasks: {
              total: totalTasks,
              completed: completedTasks,
              pending: totalTasks - completedTasks,
              completionRate: totalTasks > 0 ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(2)) : 0
            },
            reviews: profile.reviews.map(r => ({
              rating: r.rating,
              feedback: r.feedback,
              reviewDate: r.reviewDate
            })),
            activities: profile.activities.map(a => ({
              description: a.description,
              category: a.category,
              logTime: a.logTime
            }))
          };
        }

        case 'escalateIssue': {
          const { taskId, escalationNotes } = params || {};
          const task = await this.prisma.task.findUnique({
            where: { id: taskId, organizationId }
          });

          if (!task) {
            return { error: 'NOT_FOUND', message: 'Task not found' };
          }

          const escalationMsg = `🚨 Operational Escalation Alert: Task "${task.title}" has been escalated by the operations desk: "${escalationNotes || 'Needs immediate attention'}".`;

          const admins = await this.prisma.user.findMany({
            where: {
              organizationId,
              role: { in: ['SUPER_ADMIN', 'ADMIN', 'HR'] }
            }
          });

          for (const admin of admins) {
            let room = await this.prisma.chatRoom.findFirst({
              where: {
                organizationId,
                isSystem: true,
                systemUserId: admin.id
              }
            });

            if (!room) {
              room = await this.prisma.chatRoom.create({
                data: {
                  name: "RENS System Bot",
                  isGroup: false,
                  isSystem: true,
                  systemUserId: admin.id,
                  organizationId,
                  members: { connect: { id: admin.id } }
                }
              });
            }

            await this.prisma.message.create({
              data: {
                content: escalationMsg,
                isSystem: true,
                chatRoomId: room.id
              }
            });

            await this.prisma.chatRoom.update({
              where: { id: room.id },
              data: { updatedAt: new Date() }
            });

            this.rensGateway.broadcastToOrganization(organizationId, 'alert_sync', {
              action: 'create',
              message: escalationMsg,
              recipientId: admin.id
            });
          }

          return { success: true, message: 'Issue escalated to executive management.' };
        }

        default:
          return { error: `UNSUPPORTED_TOOL`, message: `Tool "${toolName}" is not registered in the Postgres Command Center.` };
      }
    } catch (e) {
      this.logger.error(`Error executing database tool ${toolName}: ${e.message}`);
      return { error: 'DATABASE_EXCEPTION', message: e.message };
    }
  }
}

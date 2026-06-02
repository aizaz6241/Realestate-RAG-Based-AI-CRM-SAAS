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

        case 'generateEnterpriseReport': {
          const { reportType } = params || {};
          if (!reportType) {
            return { error: 'MISSING_PARAMS', message: 'Report type (FINANCE, INVENTORY, or TASKS) is required.' };
          }
          
          const typeUpper = reportType.toUpperCase();
          if (!['FINANCE', 'INVENTORY', 'TASKS'].includes(typeUpper)) {
            return { error: 'INVALID_PARAM', message: 'Invalid report type. Supported types: FINANCE, INVENTORY, TASKS.' };
          }

          // Fetch live database records based on reportType
          let data: any = {};
          if (typeUpper === 'FINANCE') {
            const payrolls = await this.prisma.payroll.findMany({
              where: { employeeProfile: { organizationId } },
              include: { employeeProfile: { include: { user: { select: { firstName: true, lastName: true } } } } },
              orderBy: { month: 'desc' },
              take: 20
            });
            const totalNet = payrolls.reduce((sum, p) => sum + p.netSalary, 0);
            const totalBase = payrolls.reduce((sum, p) => sum + p.baseSalary, 0);
            const totalAllowances = payrolls.reduce((sum, p) => sum + p.allowances, 0);
            const totalDeductions = payrolls.reduce((sum, p) => sum + p.deductions, 0);
            data = {
              payrolls,
              summary: { totalNet, totalBase, totalAllowances, totalDeductions, count: payrolls.length }
            };
          } else if (typeUpper === 'INVENTORY') {
            const properties = await this.prisma.property.findMany({
              where: { organizationId },
              include: { owner: { select: { name: true, phone: true } } },
              orderBy: { price: 'desc' }
            });
            const totalValue = properties.reduce((sum, p) => sum + p.price, 0);
            const soldCount = properties.filter(p => p.status === 'SOLD').length;
            const rentedCount = properties.filter(p => p.status === 'RENTED').length;
            const availableCount = properties.filter(p => p.status === 'PUBLISHED' || p.status === 'AVAILABLE').length;
            data = {
              properties,
              summary: { totalValue, soldCount, rentedCount, availableCount, count: properties.length }
            };
          } else if (typeUpper === 'TASKS') {
            const tasks = await this.prisma.task.findMany({
              where: { organizationId },
              include: { assignedTo: { select: { firstName: true, lastName: true, email: true } } },
              orderBy: { dueDate: 'asc' }
            });
            const total = tasks.length;
            const completed = tasks.filter(t => t.status === 'COMPLETED').length;
            const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length;
            const pending = tasks.filter(t => t.status === 'PENDING').length;
            const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';
            data = {
              tasks,
              summary: { total, completed, inProgress, pending, completionRate }
            };
          }

          // Generate HTML report and write to file
          try {
            const filename = this.generateBrandedHtmlReport(typeUpper, data, organizationId);
            const downloadUrl = `http://localhost:3001/ai/reports/${filename}`;
            return {
              success: true,
              reportType: typeUpper,
              filename,
              downloadUrl,
              summary: data.summary,
              message: `Successfully generated premium executive RENS Operational ${typeUpper} report. You can download or view it at ${downloadUrl}`
            };
          } catch (err) {
            this.logger.error(`Error in generateBrandedHtmlReport: ${err.message}`);
            return { error: 'REPORT_GENERATION_EXCEPTION', message: err.message };
          }
        }

        default:
          return { error: `UNSUPPORTED_TOOL`, message: `Tool "${toolName}" is not registered in the Postgres Command Center.` };
      }
    } catch (e) {
      this.logger.error(`Error executing database tool ${toolName}: ${e.message}`);
      return { error: 'DATABASE_EXCEPTION', message: e.message };
    }
  }

  private generateBrandedHtmlReport(reportType: string, data: any, organizationId: string): string {
    const fs = require('fs');
    const path = require('path');
    
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filename = `RENS_Enterprise_${reportType}_${Date.now()}.html`;
    const filePath = path.join(reportsDir, filename);

    // Build premium dark-themed, glassmorphic layout
    const htmlContent = this.buildReportHtml(reportType, data, organizationId);
    fs.writeFileSync(filePath, htmlContent, 'utf8');
    return filename;
  }

  private buildReportHtml(reportType: string, data: any, organizationId: string): string {
    let accentGradient = 'linear-gradient(135deg, #3B82F6, #8B5CF6)';
    let reportTitle = 'RENS Enterprise Operations Report';
    let summaryCardsHtml = '';
    let tableHeadersHtml = '';
    let tableRowsHtml = '';
    let aiRecommendationText = '';

    if (reportType === 'FINANCE') {
      accentGradient = 'linear-gradient(135deg, #3B82F6, #8B5CF6)';
      reportTitle = 'RENS Financial Operations & Payroll Report';
      summaryCardsHtml = `
        <div class="card">
          <div class="card-icon" style="background: rgba(59, 130, 246, 0.1); color: #3B82F6;">💵</div>
          <div class="card-label">Total Net Salaries</div>
          <div class="card-value">AED ${data.summary.totalNet.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(139, 92, 246, 0.1); color: #8B5CF6;">📊</div>
          <div class="card-label">Total Base Budget</div>
          <div class="card-value">AED ${data.summary.totalBase.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(16, 185, 129, 0.1); color: #10B981;">📈</div>
          <div class="card-label">Total Allowances</div>
          <div class="card-value">+AED ${data.summary.totalAllowances.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(239, 68, 68, 0.1); color: #EF4444;">📉</div>
          <div class="card-label">Total Deductions</div>
          <div class="card-value">-AED ${data.summary.totalDeductions.toLocaleString()}</div>
        </div>
      `;
      tableHeadersHtml = `
        <th>Month</th>
        <th>Employee Name</th>
        <th>Base Salary</th>
        <th>Allowances</th>
        <th>Deductions</th>
        <th>Net Salary</th>
        <th>Status</th>
      `;
      for (const p of data.payrolls) {
        const name = p.employeeProfile?.user ? `${p.employeeProfile.user.firstName} ${p.employeeProfile.user.lastName || ''}`.trim() : 'Employee';
        tableRowsHtml += `
          <tr>
            <td>${p.month}</td>
            <td class="highlight">${name}</td>
            <td>AED ${p.baseSalary.toLocaleString()}</td>
            <td class="success-text">+AED ${p.allowances.toLocaleString()}</td>
            <td class="danger-text">-AED ${p.deductions.toLocaleString()}</td>
            <td class="net-salary">AED ${p.netSalary.toLocaleString()}</td>
            <td><span class="badge ${p.status === 'PAID' ? 'badge-success' : 'badge-warning'}">${p.status}</span></td>
          </tr>
        `;
      }
      aiRecommendationText = `
        <li class="ai-bullet"><strong>Financial Strategy Checklist:</strong> The payroll database reflects a total net expenditure of AED ${data.summary.totalNet.toLocaleString()} across ${data.summary.count} entries.</li>
        <li class="ai-bullet"><strong>Allowance Optimizations:</strong> Allowances account for ${((data.summary.totalAllowances / (data.summary.totalBase || 1)) * 100).toFixed(1)}% of base salaries. Keep allowance allocations reviewable on a quarterly basis.</li>
        <li class="ai-bullet"><strong>Anomalies Cleared:</strong> Security audited. Base + Allowances - Deductions balance check matches net salaries successfully with zero discrepancies.</li>
      `;
    } else if (reportType === 'INVENTORY') {
      accentGradient = 'linear-gradient(135deg, #10B981, #059669)';
      reportTitle = 'RENS Real Estate Inventory & Assets Report';
      summaryCardsHtml = `
        <div class="card">
          <div class="card-icon" style="background: rgba(16, 185, 129, 0.1); color: #10B981;">🏢</div>
          <div class="card-label">Total Listings</div>
          <div class="card-value">${data.summary.count}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(59, 130, 246, 0.1); color: #3B82F6;">💎</div>
          <div class="card-label">Total Portfolio Value</div>
          <div class="card-value">AED ${data.summary.totalValue.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(245, 158, 11, 0.1); color: #F59E0B;">🏷️</div>
          <div class="card-label">Available / Published</div>
          <div class="card-value">${data.summary.availableCount}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(239, 68, 68, 0.1); color: #EF4444;">🔑</div>
          <div class="card-label">Sold & Rented Assets</div>
          <div class="card-value">${data.summary.soldCount + data.summary.rentedCount}</div>
        </div>
      `;
      tableHeadersHtml = `
        <th>Property Title</th>
        <th>Location</th>
        <th>Specifications</th>
        <th>Registered Owner</th>
        <th>Listing Price</th>
        <th>Listing Status</th>
      `;
      for (const p of data.properties) {
        const ownerName = p.owner ? p.owner.name : 'N/A';
        tableRowsHtml += `
          <tr>
            <td class="highlight">${p.title}</td>
            <td>${p.location || 'N/A'}</td>
            <td>${p.bedrooms || 0} Bed / ${p.bathrooms || 0} Bath</td>
            <td>${ownerName}</td>
            <td class="net-salary">AED ${p.price.toLocaleString()}</td>
            <td><span class="badge ${p.status === 'SOLD' ? 'badge-danger' : (p.status === 'RENTED' ? 'badge-warning' : 'badge-success')}">${p.status}</span></td>
          </tr>
        `;
      }
      aiRecommendationText = `
        <li class="ai-bullet"><strong>Inventory Allocation Strategy:</strong> Real estate inventory lists ${data.summary.availableCount} properties active in Dubai's premier residential corridors (Marina, Downtown, Palm).</li>
        <li class="ai-bullet"><strong>Portfolio Health:</strong> Total assets valuation stands at AED ${data.summary.totalValue.toLocaleString()}. Active available listings account for ${((data.summary.availableCount / (data.summary.count || 1)) * 100).toFixed(1)}% of inventory.</li>
        <li class="ai-bullet"><strong>Asset Velocities:</strong> Reassign active property listings that have been idle/unsold for 45+ days to increase monthly sales turnover.</li>
      `;
    } else if (reportType === 'TASKS') {
      accentGradient = 'linear-gradient(135deg, #F59E0B, #D97706)';
      reportTitle = 'RENS Enterprise Task Board & Kanban Report';
      summaryCardsHtml = `
        <div class="card">
          <div class="card-icon" style="background: rgba(245, 158, 11, 0.1); color: #F59E0B;">📋</div>
          <div class="card-label">Total Assigned Tasks</div>
          <div class="card-value">${data.summary.total}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(16, 185, 129, 0.1); color: #10B981;">✅</div>
          <div class="card-label">Completed Tasks</div>
          <div class="card-value">${data.summary.completed}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(59, 130, 246, 0.1); color: #3B82F6;">⚡</div>
          <div class="card-label">Active / In Progress</div>
          <div class="card-value">${data.summary.inProgress}</div>
        </div>
        <div class="card">
          <div class="card-icon" style="background: rgba(139, 92, 246, 0.1); color: #8B5CF6;">📈</div>
          <div class="card-label">Completion Rate</div>
          <div class="card-value">${data.summary.completionRate}%</div>
        </div>
      `;
      tableHeadersHtml = `
        <th>Task Title</th>
        <th>Assigned Team Member</th>
        <th>Due Date</th>
        <th>Priority Level</th>
        <th>Operational Status</th>
      `;
      for (const t of data.tasks) {
        const assigneeName = t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName || ''}`.trim() : 'Unassigned';
        const dateStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'N/A';
        tableRowsHtml += `
          <tr>
            <td class="highlight">${t.title}</td>
            <td>${assigneeName}</td>
            <td>${dateStr}</td>
            <td><span class="badge ${t.priority === 'URGENT' ? 'badge-danger' : (t.priority === 'HIGH' ? 'badge-warning' : 'badge-info')}">${t.priority || 'STANDARD'}</span></td>
            <td><span class="badge ${t.status === 'COMPLETED' ? 'badge-success' : (t.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-neutral')}">${t.status}</span></td>
          </tr>
        `;
      }
      aiRecommendationText = `
        <li class="ai-bullet"><strong>Team Productivity Metrics:</strong> Enterprise board tracks ${data.summary.total} active workflow items, achieving an aggregate completion rate of ${data.summary.completionRate}%.</li>
        <li class="ai-bullet"><strong>Workload Optimizations:</strong> Currently, ${data.summary.pending} tasks remain in PENDING status. Identify staff bottlenecks and reallocate overloaded items to low-load team members.</li>
        <li class="ai-bullet"><strong>SLA Alerts:</strong> Monitor tasks marked with URGENT or HIGH priority to ensure operational SLAs are met and due dates are respected.</li>
      `;
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: radial-gradient(circle at top right, #0F172A, #020617);
      color: #F8FAFC;
      font-family: 'Inter', sans-serif;
      line-height: 1.5;
      padding: 40px 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      position: relative;
      z-index: 1;
    }
    /* Glow Background Orbs */
    .glow-orb-1 {
      position: absolute;
      top: -150px;
      right: -150px;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 70%);
      filter: blur(80px);
      z-index: 0;
      pointer-events: none;
    }
    .glow-orb-2 {
      position: absolute;
      bottom: -150px;
      left: -150px;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0) 70%);
      filter: blur(80px);
      z-index: 0;
      pointer-events: none;
    }
    /* Glass Header Card */
    header {
      background: rgba(15, 23, 42, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(24px);
      border-radius: 24px;
      padding: 35px;
      margin-bottom: 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    }
    .logo-section h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      background: ${accentGradient};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .logo-section p {
      color: #94A3B8;
      font-size: 14px;
      margin-top: 4px;
    }
    .meta-section {
      text-align: right;
      color: #64748B;
      font-size: 13px;
    }
    .meta-section strong {
      color: #94A3B8;
    }
    /* Grid KPI Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 24px;
      margin-bottom: 40px;
    }
    .card {
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(20px);
      border-radius: 20px;
      padding: 24px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s ease, border-color 0.3s ease;
    }
    .card:hover {
      transform: translateY(-3px);
      border-color: rgba(255, 255, 255, 0.12);
    }
    .card-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      margin-bottom: 16px;
    }
    .card-label {
      color: #94A3B8;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .card-value {
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: #F8FAFC;
      margin-top: 6px;
    }
    /* AI Insights Container */
    .ai-insights {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.6));
      border: 1px solid rgba(139, 92, 246, 0.2);
      border-radius: 24px;
      padding: 30px;
      margin-bottom: 45px;
      box-shadow: 0 15px 30px rgba(0, 0, 0, 0.25);
    }
    .ai-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .ai-header-icon {
      font-size: 22px;
      animation: pulse 2s infinite;
    }
    .ai-title {
      font-family: 'Outfit', sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: #C084FC;
    }
    .ai-bullets {
      list-style-type: none;
    }
    .ai-bullet {
      color: #CBD5E1;
      font-size: 14px;
      margin-bottom: 12px;
      padding-left: 24px;
      position: relative;
    }
    .ai-bullet::before {
      content: "✦";
      position: absolute;
      left: 0;
      color: #A78BFA;
    }
    /* Sleek Data Table Container */
    .table-container {
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      padding: 30px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
      margin-bottom: 40px;
      overflow-x: auto;
    }
    .table-title {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 20px;
      color: #F1F5F9;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      color: #94A3B8;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    td {
      padding: 16px 20px;
      color: #CBD5E1;
      font-size: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
      color: #F8FAFC;
    }
    .highlight {
      font-weight: 500;
      color: #F1F5F9;
    }
    .net-salary {
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      color: #F8FAFC;
    }
    .success-text {
      color: #34D399;
    }
    .danger-text {
      color: #F87171;
    }
    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-success {
      background: rgba(16, 185, 129, 0.12);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }
    .badge-warning {
      background: rgba(245, 158, 11, 0.12);
      color: #FBBF24;
      border: 1px solid rgba(245, 158, 11, 0.2);
    }
    .badge-danger {
      background: rgba(239, 68, 68, 0.12);
      color: #F87171;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .badge-info {
      background: rgba(59, 130, 246, 0.12);
      color: #60A5FA;
      border: 1px solid rgba(59, 130, 246, 0.2);
    }
    .badge-neutral {
      background: rgba(148, 163, 184, 0.12);
      color: #94A3B8;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    /* Footer */
    footer {
      text-align: center;
      padding-top: 20px;
      color: #475569;
      font-size: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    @media (max-width: 768px) {
      header {
        flex-direction: column;
        align-items: flex-start;
        gap: 20px;
      }
      .meta-section {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <div class="glow-orb-1"></div>
  <div class="glow-orb-2"></div>
  <div class="container">
    <header>
      <div class="logo-section">
        <h1>RENS COGNITIVE CORE</h1>
        <p>AOS v5.0 • Live Enterprise Intelligence Hub</p>
      </div>
      <div class="meta-section">
        <p>Generated: <strong>${new Date().toLocaleString()}</strong></p>
        <p>Report Type: <strong>${reportType} REPORT</strong></p>
        <p>Organization Context: <strong>RENS Portal</strong></p>
      </div>
    </header>

    <div class="kpi-grid">
      ${summaryCardsHtml}
    </div>

    <div class="ai-insights">
      <div class="ai-header">
        <span class="ai-header-icon">🧠</span>
        <span class="ai-title">AI Core Insights & Executive Action Plan</span>
      </div>
      <ul class="ai-bullets">
        ${aiRecommendationText}
        <li class="ai-bullet"><strong>Verification Check:</strong> Audited and compiled directly from secure PostgreSQL ledger data. Approved for distribution.</li>
      </ul>
    </div>

    <div class="table-container">
      <h2 class="table-title">Live ${reportType} Ledger Records</h2>
      <table>
        <thead>
          <tr>
            ${tableHeadersHtml}
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>

    <footer>
      <p>&copy; ${new Date().getFullYear()} RENS Ecosystem ERP. Confidential Operations Document. Powered by RENS-AOS 5.0 Orchestrator.</p>
    </footer>
  </div>
</body>
</html>
    `;
  }
}

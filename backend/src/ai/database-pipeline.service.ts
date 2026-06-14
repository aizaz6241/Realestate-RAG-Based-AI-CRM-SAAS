import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiLlmService } from './ai-llm.service';
import { TenantIsolationService } from './tenant-isolation.service';

export interface DatabasePipelineResult {
  rows: any[];
  verified: boolean;
  confidenceScore: number;
  tablesUsed: string[];
  queriesRun: string[];
  errors: string[];
  rawLlmResponse?: string;
  parseError?: string;
  generatedPlan?: any;
  validationResult?: any;
}

// Layer 1: Schema Registry
/*
// ROLLBACK BACKUP: ORIGINAL SCHEMA_REGISTRY
export const SCHEMA_REGISTRY = {
  tables: {
    property: {
      name: 'Property',
      description: 'Real estate listings for rent or sale.',
      columns: {
        id: 'uuid primary key',
        title: 'title or name of listing',
        type: 'APARTMENT, VILLA, COMMERCIAL, PLOT',
        status: 'DRAFT, PUBLISHED, SOLD, RENTED, AVAILABLE',
        listingType: 'RENT, SALE',
        price: 'asking price or rental amount (AED)',
        location: 'geographical location (e.g. Dubai Marina, JVC, Downtown)',
        bedrooms: 'number of bedrooms',
        bathrooms: 'number of bathrooms',
        areaSqft: 'total area in square feet',
        ownerId: 'link to landlord/owner profile'
      }
    },
    employeeprofile: {
      name: 'EmployeeProfile',
      description: 'Internal staff members and designations.',
      columns: {
        id: 'uuid primary key',
        userId: 'associated user account link',
        department: 'department (e.g., Sales, HR, Finance, Logistics)',
        designation: 'job title (e.g. agent, manager, COO)',
        salary: 'monthly base salary',
        status: 'ACTIVE, ON_LEAVE, TERMINATED'
      }
    },
    attendance: {
      name: 'Attendance',
      description: 'Daily check-in logs for employee attendance.',
      columns: {
        id: 'uuid primary key',
        dateStr: 'format YYYY-MM-DD',
        checkIn: 'timestamp',
        checkOut: 'timestamp',
        status: 'PRESENT, LATE, ABSENT, ON_LEAVE',
        employeeProfileId: 'link to employee profile'
      }
    },
    payroll: {
      name: 'Payroll',
      description: 'Monthly payroll salary batches disbursed to employees.',
      columns: {
        id: 'uuid primary key',
        month: 'format YYYY-MM',
        baseSalary: 'base salary amount',
        allowances: 'bonus/allowance amount',
        deductions: 'deducted amount',
        netSalary: 'net payout',
        status: 'PAID, UNPAID',
        employeeProfileId: 'link to employee profile'
      }
    },
    task: {
      name: 'Task',
      description: 'Task checklists and todos assigned to staff.',
      columns: {
        id: 'uuid primary key',
        title: 'title of the task',
        status: 'PENDING, IN_PROGRESS, COMPLETED',
        dueDate: 'timestamp when task is due',
        assignedToId: 'link to user assigned'
      }
    },
    lead: {
      name: 'Lead',
      description: 'Open sales leads and prospects.',
      columns: {
        id: 'uuid primary key',
        name: 'lead name',
        status: 'NEW, CONTACTED, ENGAGED, DISQUALIFIED, CLOSED',
        score: 'lead score index',
        assignedToId: 'user assigned to broker this lead'
      }
    },
    client: {
      name: 'Client',
      description: 'CRM Clients profiles representing buyers/tenants/investors.',
      columns: {
        id: 'uuid primary key',
        name: 'client name',
        type: 'BUYER, SELLER, INVESTOR',
        stage: 'INQUIRY, VIEWING, OFFER, CLOSED',
        budget: 'target investment/rental budget (AED)'
      }
    }
  }
};
*/

export const SCHEMA_REGISTRY = {
  tables: {
    property: {
      name: 'Property',
      description: 'Real estate listings for rent or sale.',
      columns: {
        id: 'uuid primary key',
        title: 'title or name of listing',
        type: 'APARTMENT, VILLA, COMMERCIAL, PLOT',
        status: 'DRAFT, PUBLISHED, SOLD, RENTED, AVAILABLE',
        listingType: 'RENT, SALE',
        price: 'asking price or rental amount (AED)',
        location: 'geographical location (e.g. Dubai Marina, JVC, Downtown)',
        bedrooms: 'number of bedrooms',
        bathrooms: 'number of bathrooms',
        areaSqft: 'total area in square feet',
        ownerId: 'link to landlord/owner profile'
      }
    },
    employeeprofile: {
      name: 'EmployeeProfile',
      description: 'Internal staff members and designations.',
      columns: {
        id: 'uuid primary key',
        userId: 'associated user account link',
        department: 'department (e.g., Sales, HR, Finance, Logistics)',
        designation: 'job title (e.g. agent, manager, COO)',
        salary: 'monthly base salary',
        status: 'ACTIVE, ON_LEAVE, TERMINATED'
      }
    },
    attendance: {
      name: 'Attendance',
      description: 'Daily check-in logs for employee attendance.',
      columns: {
        id: 'uuid primary key',
        dateStr: 'format YYYY-MM-DD',
        checkIn: 'timestamp',
        checkOut: 'timestamp',
        status: 'PRESENT, LATE, ABSENT, ON_LEAVE',
        employeeProfileId: 'link to employee profile'
      }
    },
    payroll: {
      name: 'Payroll',
      description: 'Monthly payroll salary batches disbursed to employees.',
      columns: {
        id: 'uuid primary key',
        month: 'format YYYY-MM',
        baseSalary: 'base salary amount',
        allowances: 'bonus/allowance amount',
        deductions: 'deducted amount',
        netSalary: 'net payout',
        status: 'PAID, UNPAID',
        employeeProfileId: 'link to employee profile'
      }
    },
    task: {
      name: 'Task',
      description: 'Task checklists and todos assigned to staff.',
      columns: {
        id: 'uuid primary key',
        title: 'title of the task',
        status: 'PENDING, IN_PROGRESS, COMPLETED',
        dueDate: 'timestamp when task is due',
        assignedToId: 'link to user assigned'
      }
    },
    lead: {
      name: 'Lead',
      description: 'Open sales leads and prospects.',
      columns: {
        id: 'uuid primary key',
        name: 'lead name',
        status: 'NEW, CONTACTED, ENGAGED, DISQUALIFIED, CLOSED',
        score: 'lead score index',
        assignedToId: 'user assigned to broker this lead'
      }
    },
    client: {
      name: 'Client',
      description: 'CRM Clients profiles representing buyers/tenants/investors.',
      columns: {
        id: 'uuid primary key',
        name: 'client name',
        type: 'BUYER, SELLER, INVESTOR',
        stage: 'INQUIRY, VIEWING, OFFER, CLOSED',
        budget: 'target investment/rental budget (AED)'
      }
    },
    leaverequest: {
      name: 'LeaveRequest',
      description: 'Employee leave requests and vacation status.',
      columns: {
        id: 'uuid primary key',
        startDate: 'start date of leave (timestamp)',
        endDate: 'end date of leave (timestamp)',
        type: 'leave type (SICK, CASUAL, ANNUAL, UNPAID)',
        status: 'approval status (PENDING, APPROVED, REJECTED)',
        reason: 'reason explanation for leave Request',
        employeeProfileId: 'link to employee profile'
      }
    },
    vehicle: {
      name: 'Vehicle',
      description: 'Fleet vehicles for logistics or client property viewings.',
      columns: {
        id: 'uuid primary key',
        modelName: 'model or brand name of vehicle',
        plateNumber: 'unique vehicle plate registration number',
        status: 'status (ACTIVE, MAINTENANCE, OUT_OF_SERVICE)'
      }
    },
    vehiclemaintenance: {
      name: 'VehicleMaintenance',
      description: 'Maintenance and repair logs for fleet vehicles.',
      columns: {
        id: 'uuid primary key',
        description: 'details of maintenance/repair work',
        cost: 'total maintenance cost (AED)',
        status: 'status of request (PENDING, COMPLETED, CANCELLED)',
        requestDate: 'date requested (timestamp)',
        vehicleId: 'link to vehicle'
      }
    },
    logisticsschedule: {
      name: 'LogisticsSchedule',
      description: 'Logistics pickup and drop transport schedules.',
      columns: {
        id: 'uuid primary key',
        visitDate: 'date/time of logistics trip (timestamp)',
        pickupLocation: 'pickup address location description',
        dropLocation: 'destination address location description',
        status: 'trip status (SCHEDULED, IN_TRANSIT, COMPLETED, CANCELLED)',
        driverId: 'link to driver profile',
        vehicleId: 'link to vehicle'
      }
    },
    owner: {
      name: 'Owner',
      description: 'Property owners, landlords, or property sellers.',
      columns: {
        id: 'uuid primary key',
        name: 'name of landlord or owner',
        phone: 'phone contact number',
        email: 'email address of owner',
        status: 'status (ACTIVE, INACTIVE)',
        kycVerified: 'boolean value indicating if KYC is verified'
      }
    },
    clientviewing: {
      name: 'ClientViewing',
      description: 'Property viewing visits scheduled for potential clients.',
      columns: {
        id: 'uuid primary key',
        viewingDate: 'date and time of viewing visit (timestamp)',
        feedback: 'client feedback text comments',
        status: 'status of viewing (SCHEDULED, COMPLETED, CANCELLED)',
        clientId: 'link to client profile',
        propertyId: 'link to property listing'
      }
    },
    clientpropertyinterest: {
      name: 'ClientPropertyInterest',
      description: 'Mapping of clients who show specific interest in properties.',
      columns: {
        id: 'uuid primary key',
        clientId: 'link to client profile',
        propertyId: 'link to property listing'
      }
    },
    leadactivity: {
      name: 'LeadActivity',
      description: 'Communication activities timeline log for a lead.',
      columns: {
        id: 'uuid primary key',
        type: 'activity type (CALL, EMAIL, NOTES, STATUS_CHANGE)',
        description: 'summary of what happened during activity',
        activityDate: 'date of activity (timestamp)',
        leadId: 'link to lead'
      }
    },
    calendarevent: {
      name: 'CalendarEvent',
      description: 'Internal meetings, schedules, and events.',
      columns: {
        id: 'uuid primary key',
        title: 'title of the meeting or event',
        description: 'detailed description of meeting',
        startTime: 'start time of meeting (timestamp)',
        endTime: 'end time of meeting (timestamp)',
        location: 'room name or address location description'
      }
    },
    keytracker: {
      name: 'KeyTracker',
      description: 'Real estate physical keys tracking records.',
      columns: {
        id: 'uuid primary key',
        keyTag: 'unique key tag reference (e.g. KEY-DHA-42)',
        status: 'current status (IN_OFFICE, CHECKED_OUT, LOST)',
        propertyId: 'link to property listing'
      }
    },
    keycheckout: {
      name: 'KeyCheckout',
      description: 'Audit trails of checked out property keys by staff.',
      columns: {
        id: 'uuid primary key',
        checkoutDate: 'date keys were checked out (timestamp)',
        returnDate: 'date keys were returned (timestamp)',
        keyId: 'link to key tracker record',
        userId: 'link to user who checked out'
      }
    },
    employeedocument: {
      name: 'EmployeeDocument',
      description: 'Employee professional files, Emirates IDs, resumes, contracts.',
      columns: {
        id: 'uuid primary key',
        name: 'document name (e.g. Resume, Emirates ID)',
        category: 'document category (ID, CONTRACT, RESUME, OTHER)',
        fileUrl: 'file storage URL string',
        uploadedAt: 'date uploaded (timestamp)',
        employeeProfileId: 'link to employee profile'
      }
    },
    performancereview: {
      name: 'PerformanceReview',
      description: 'Performance reviews, ratings, and appraisals for staff.',
      columns: {
        id: 'uuid primary key',
        reviewDate: 'date of review (timestamp)',
        rating: 'review rating stars index (1 to 5)',
        feedback: 'detailed review appraisal comments text',
        employeeProfileId: 'link to employee profile review target'
      }
    },
    propertypricehistory: {
      name: 'PropertyPriceHistory',
      description: 'Historical listing price changes audit logs for properties.',
      columns: {
        id: 'uuid primary key',
        price: 'historical listed price amount (AED)',
        changeDate: 'date price was changed (timestamp)',
        propertyId: 'link to property listing'
      }
    },
    ownerdocument: {
      name: 'OwnerDocument',
      description: 'KYC, agreements, title deeds, and POA files uploaded for landlords.',
      columns: {
        id: 'uuid primary key',
        name: 'document name (Emirates ID, Title Deed, POA)',
        fileUrl: 'file storage URL string',
        uploadedAt: 'date uploaded (timestamp)',
        ownerId: 'link to property owner landlord'
      }
    },
    ownercommunication: {
      name: 'OwnerCommunication',
      description: 'Logs of historical communications (calls, emails) with landlords.',
      columns: {
        id: 'uuid primary key',
        type: 'communication type (CALL, EMAIL, MEETING, WHATSAPP)',
        summary: 'summary details of conversation',
        date: 'date of communication (timestamp)',
        ownerId: 'link to property owner landlord'
      }
    },
    clientcommunication: {
      name: 'ClientCommunication',
      description: 'Logs of historical communications (calls, emails) with CRM clients.',
      columns: {
        id: 'uuid primary key',
        type: 'communication type (CALL, EMAIL, MEETING, WHATSAPP)',
        summary: 'summary details of conversation',
        date: 'date of communication (timestamp)',
        clientId: 'link to client profile'
      }
    },
    driverprofile: {
      name: 'DriverProfile',
      description: 'Driver credentials, licenses, and availability statuses.',
      columns: {
        id: 'uuid primary key',
        licenseNumber: 'driver license identification number',
        status: 'status (AVAILABLE, BUSY, OFF_DUTY)',
        employeeProfileId: 'link to employee profile'
      }
    }
  }
};

export const SCHEMA_RELATION_REGISTRY = {
  employeeprofile: {
    relations: {
      user: { model: 'user', foreignKey: 'userId', fields: ['firstName', 'lastName', 'email', 'role', 'name'] }
    }
  },
  property: {
    relations: {
      owner: { model: 'owner', foreignKey: 'ownerId', fields: ['name', 'phone'] }
    }
  },
  lead: {
    relations: {
      assignedTo: { model: 'user', foreignKey: 'assignedToId', fields: ['firstName', 'lastName'] }
    }
  },
  task: {
    relations: {
      assignedTo: { model: 'user', foreignKey: 'assignedToId', fields: ['firstName', 'lastName'] }
    }
  }
};

@Injectable()
export class DatabasePipelineService {
  private readonly logger = new Logger(DatabasePipelineService.name);

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            )
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  mapRelationalFilters(entity: string, filters: any): any {
    if (!filters || typeof filters !== 'object') return filters;
    
    const entKey = entity.toLowerCase();
    const registry = SCHEMA_RELATION_REGISTRY[entKey];
    if (!registry) return filters;
    
    const mapped: any = {};
    for (const key of Object.keys(filters)) {
      const val = filters[key];
      let resolved = false;
      
      for (const relKey of Object.keys(registry.relations)) {
        const relConfig = registry.relations[relKey];
        if (relConfig.fields.includes(key)) {
          mapped[relKey] = mapped[relKey] || {};
          if (key === 'name') {
            mapped[relKey]['firstName'] = val;
          } else {
            mapped[relKey][key] = val;
          }
          resolved = true;
          break;
        }
      }
      
      if (!resolved) {
        mapped[key] = val;
      }
    }
    
    return mapped;
  }

  buildStageWhereClause(baseWhere: any, stage: number): any {
    const where = JSON.parse(JSON.stringify(baseWhere));
    
    const transformValue = (val: any, s: number, keyName?: string): any => {
      if (keyName && this.tenantIsolationService.isSecurityKey(keyName)) {
        return val; // Protect security key from wildcard conversions
      }
      if (typeof val === 'string') {
        if (s === 1) return val;
        if (s === 2) return { equals: val, mode: 'insensitive' };
        if (s === 3) return { contains: val, mode: 'insensitive' };
        if (s === 4) return { contains: val, mode: 'insensitive' };
      }
      if (typeof val === 'object' && val !== null) {
        // Skip operators like contains, mode, equals
        if (val.contains !== undefined || val.equals !== undefined) return val;
        const trans: any = {};
        for (const k of Object.keys(val)) {
          trans[k] = transformValue(val[k], s, k);
        }
        return trans;
      }
      return val;
    };

    const transformed: any = {};
    for (const k of Object.keys(where)) {
      transformed[k] = transformValue(where[k], stage, k);
    }
    return transformed;
  }


  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService,
    private tenantIsolationService: TenantIsolationService
  ) {}

  // Layer 2: Semantic Mapping Engine
  semanticMapping(query: string): { mappedEntities: string[]; mappedFilters: any } {
    const q = query.toLowerCase();
    const entities: string[] = [];
    const filters: any = {};

    if (q.includes('revenue') || q.includes('salary') || q.includes('paisa') || q.includes('payroll')) {
      entities.push('payroll');
    }
    if (q.includes('property') || q.includes('listing') || q.includes('apartment') || q.includes('villa') || q.includes('rent') || q.includes('sale')) {
      entities.push('property');
    }
    if (q.includes('employee') || q.includes('staff') || q.includes('agent') || q.includes('designation')) {
      entities.push('employeeprofile');
    }
    if (q.includes('attendance') || q.includes('hazri') || q.includes('late') || q.includes('absent') || q.includes('present')) {
      entities.push('attendance');
    }
    if (q.includes('task') || q.includes('todo') || q.includes('checklist')) {
      entities.push('task');
    }
    if (q.includes('lead')) {
      entities.push('lead');
    }
    if (q.includes('client') || q.includes('buyer') || q.includes('investor') || q.includes('budget')) {
      entities.push('client');
    }
    if (q.includes('leave') || q.includes('chutti') || q.includes('vacation')) {
      entities.push('leaverequest');
    }
    if (q.includes('vehicle') || q.includes('gari') || q.includes('car')) {
      entities.push('vehicle');
    }
    if (q.includes('maintenance') || q.includes('repair') || q.includes('kharcha')) {
      entities.push('vehiclemaintenance');
    }
    if (q.includes('logistics') || q.includes('delivery') || q.includes('route') || q.includes('schedule')) {
      entities.push('logisticsschedule');
    }
    if (q.includes('owner') || q.includes('landlord') || q.includes('malik')) {
      entities.push('owner');
    }
    if (q.includes('viewing') || q.includes('visit') || q.includes('dikhana')) {
      entities.push('clientviewing');
    }
    if (q.includes('interest') || q.includes('like') || q.includes('pasand')) {
      entities.push('clientpropertyinterest');
    }
    if (q.includes('activity') || q.includes('lead timeline')) {
      entities.push('leadactivity');
    }
    if (q.includes('event') || q.includes('meeting') || q.includes('calendar')) {
      entities.push('calendarevent');
    }
    if (q.includes('key') || q.includes('chabi')) {
      entities.push('keytracker');
    }
    if (q.includes('checkout') || q.includes('return')) {
      entities.push('keycheckout');
    }
    if (q.includes('employee document') || q.includes('staff file') || q.includes('resume') || q.includes('cv') || q.includes('passport') || q.includes('visa')) {
      entities.push('employeedocument');
    }
    if (q.includes('performance') || q.includes('appraisal') || q.includes('rating') || q.includes('review')) {
      entities.push('performancereview');
    }
    if (q.includes('price history') || q.includes('past price') || q.includes('price change')) {
      entities.push('propertypricehistory');
    }
    if (q.includes('owner document') || q.includes('landlord file') || q.includes('owner paper')) {
      entities.push('ownerdocument');
    }
    if (q.includes('owner call') || q.includes('owner email') || q.includes('owner communication') || q.includes('owner chat')) {
      entities.push('ownercommunication');
    }
    if (q.includes('client call') || q.includes('client email') || q.includes('client communication') || q.includes('client chat')) {
      entities.push('clientcommunication');
    }
    if (q.includes('driver') || q.includes('license')) {
      entities.push('driverprofile');
    }

    if (entities.length === 0) {
      entities.push('property'); // Safe default
    }

    return {
      mappedEntities: entities,
      mappedFilters: filters
    };
  }

  // Layer 3: Natural Language to SQL/Query Engine
  async generateQueryPlan(
    queryText: string,
    mappedEntities: string[],
    organizationId: string,
    userId: string,
    userRole: string
  ): Promise<any> {
    this.logger.log(`[Layer 3: NL-to-SQL Engine] Translating: "${queryText}"`);

    const schemaSub = {};
    for (const ent of mappedEntities) {
      if (SCHEMA_REGISTRY.tables[ent]) {
        schemaSub[ent] = SCHEMA_REGISTRY.tables[ent];
      }
    }

    const nlsPrompt = `You are the Zorvex AI V9 NL-to-SQL & Query Plan Generator (Layer 3).
Convert the user request query step into a structured database query plan parameters object for Prisma.

User Query: "${queryText}"
Target Models: ${JSON.stringify(mappedEntities)}
Schema Registry:
${JSON.stringify(schemaSub, null, 2)}

Instructions:
1. Translate the user query into valid filters, groupby, metrics, and operation options.
2. The plan must output parameters matching this format:
{
  "operation": "fetch | aggregate | compare | analyze",
  "entities": ["property" | "employeeprofile" | "attendance" | "payroll" | "task" | "lead" | "client"],
  "filters": {
     // Standard Prisma where clause representation, resolving dates and location variables
     // Resolve location phonetics (e.g. "marina" to "Dubai Marina", "downtown" to "Downtown Dubai")
  },
  "groupBy": ["field1", ...], // Optional array
  "metrics": ["field1", ...], // Optional array for aggregates (e.g. netSalary, baseSalary, price, budget)
  "take": 50
}

Return ONLY raw JSON matching the format. Do not include markdown code block tags.`;

    let resText = '';
    try {
      resText = await this.llmService.callLLM(
        nlsPrompt,
        `Generate query parameters`,
        [],
        false,
        organizationId,
        userId
      );
      const cleanJson = resText.trim();
      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        let rawJson = cleanJson.substring(jsonStart, jsonEnd + 1);
        // Strip single-line comments (//...)
        rawJson = rawJson.replace(/\/\/.*$/gm, '');
        // Strip multi-line comments (/*...*/)
        rawJson = rawJson.replace(/\/\*[\s\S]*?\*\//g, '');
        const parsed = JSON.parse(rawJson);
        return {
          ...parsed,
          _rawLlmResponse: resText,
          _parseError: null
        };
      } else {
        throw new Error('No JSON object boundaries found in response.');
      }
    } catch (e) {
      this.logger.warn(`NL-to-SQL engine parsing failed: ${e.message}`);
      return {
        operation: 'fetch',
        entities: mappedEntities,
        filters: {},
        take: 20,
        _rawLlmResponse: resText,
        _parseError: e.message
      };
    }
  }

  // Layer 4 & 5: SQL Validation Engine & Query Optimization Engine
  validateAndOptimizeQuery(queryPlan: any, userRole: string): { isValid: boolean; errorMsg?: string; optimizedPlan: any } {
    this.logger.log(`[Layer 4 & 5: Validation & Optimization] Validating Prisma query plan parameters`);

    // Validation checks
    const unauthorizedEntities = ['payroll'];
    if (queryPlan.entities.some(e => unauthorizedEntities.includes(e))) {
      const isAuthorized = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(userRole);
      if (!isAuthorized) {
        return {
          isValid: false,
          errorMsg: 'Clearance Required: Your user profile is not cleared to access secure finance databases.',
          optimizedPlan: null
        };
      }
    }

    const logisticsEntities = ['vehicle', 'logisticsschedule'];
    if (queryPlan.entities.some(e => logisticsEntities.includes(e))) {
      const isAuthorized = ['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'].includes(userRole);
      if (!isAuthorized) {
        return {
          isValid: false,
          errorMsg: 'Clearance Required: Your user profile is not cleared to access secure logistics databases.',
          optimizedPlan: null
        };
      }
    }

    // Block modifications - only read queries allowed
    if (queryPlan.operation === 'delete' || queryPlan.operation === 'update' || queryPlan.operation === 'create') {
      return {
        isValid: false,
        errorMsg: 'Security Violation: Database retrieval pipeline is strictly READ ONLY. Alter/Delete statements blocked.',
        optimizedPlan: null
      };
    }

    // Optimization step
    const optimized = { ...queryPlan };
    if (!optimized.take) {
      optimized.take = 25; // Limit scan sizes
    }
    optimized.take = Math.min(optimized.take, 100); // Caps scanning to avoid memory bloat

    return {
      isValid: true,
      optimizedPlan: optimized
    };
  }

  // Layer 6: Database Execution Engine
  async executeDatabaseQuery(
    optimizedPlan: any,
    organizationId: string,
    userId: string,
    userRole: string
  ): Promise<any[]> {
    this.logger.log(`[Layer 6: Database Execution] Running query against NeonDB: ${JSON.stringify(optimizedPlan)}`);

    const results: any[] = [];
    const modelMap: Record<string, string> = {
      organization: 'organization',
      user: 'user',
      employeeprofile: 'employeeProfile',
      employeedocument: 'employeeDocument',
      attendance: 'attendance',
      leaverequest: 'leaveRequest',
      activitylog: 'activityLog',
      performancereview: 'performanceReview',
      property: 'property',
      lead: 'lead',
      client: 'client',
      task: 'task',
      owner: 'owner',
      ownercommunication: 'ownerCommunication',
      ownerdocument: 'ownerDocument',
      clientpropertyinterest: 'clientPropertyInterest',
      clientviewing: 'clientViewing',
      clientcommunication: 'clientCommunication',
      payroll: 'payroll',
      propertypricehistory: 'propertyPriceHistory',
      document: 'document',
      documentversion: 'documentVersion',
      driverprofile: 'driverProfile',
      vehicle: 'vehicle',
      vehiclemaintenance: 'vehicleMaintenance',
      logisticsschedule: 'logisticsSchedule',
      keytracker: 'keyTracker',
      keycheckout: 'keyCheckout',
      leadactivity: 'leadActivity',
      chatroom: 'chatRoom',
      message: 'message',
      calendarevent: 'calendarEvent',
      aidocument: 'aiDocument',
      aidocumentchunk: 'aiDocumentChunk',
      aichatsession: 'aiChatSession',
      integrationconfig: 'integrationConfig',
      communicationtemplate: 'communicationTemplate',
      integrationlog: 'integrationLog',
      aimemoryvector: 'aiMemoryVector',
      subscription: 'subscription',
      subscriptionpayment: 'subscriptionPayment',
      apiusagelog: 'apiUsageLog'
    };

    // Deep date resolver helper
    const resolveDateStrings = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'string') {
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
        if (isoDateRegex.test(obj)) {
          const date = new Date(obj);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(item => resolveDateStrings(item));
      if (typeof obj === 'object') {
        const resObj: any = {};
        for (const k of Object.keys(obj)) {
          resObj[k] = resolveDateStrings(obj[k]);
        }
        return resObj;
      }
      return obj;
    };

    const cleanFilters = resolveDateStrings(optimizedPlan.filters || {});

    for (const ent of optimizedPlan.entities) {
      const modelKey = modelMap[ent.toLowerCase()];
      if (!modelKey) continue;

      const model = this.prisma[modelKey];
      const whereClause = this.tenantIsolationService.injectTenantFilter(ent, cleanFilters, organizationId);

      // Role boundaries injection
      if (userRole === 'AGENT') {
        if (['lead', 'task', 'client'].includes(ent.toLowerCase())) {
          whereClause.assignedToId = userId;
        }
      }

      try {
        if (optimizedPlan.operation === 'aggregate') {
          let rows: any[] = [];
          for (let stage = 1; stage <= 4; stage++) {
            const stageWhere = this.buildStageWhereClause(whereClause, stage);
            const aggArgs: any = {
              where: stageWhere,
              _count: true
            };
            if (optimizedPlan.metrics && optimizedPlan.metrics.length > 0) {
              aggArgs._sum = {};
              aggArgs._avg = {};
              const validNumericFields = [
                'price', 'bedrooms', 'bathrooms', 'areaSqft', 'salary', 
                'netSalary', 'baseSalary', 'allowances', 'deductions', 
                'cost', 'amount', 'rating', 'duration', 'progress'
              ];
              for (const m of optimizedPlan.metrics) {
                if (m === 'count') continue;
                if (!validNumericFields.includes(m)) continue;
                aggArgs._sum[m] = true;
                aggArgs._avg[m] = true;
              }
              if (Object.keys(aggArgs._sum).length === 0) {
                delete aggArgs._sum;
                delete aggArgs._avg;
              }
            }

            if (optimizedPlan.groupBy && optimizedPlan.groupBy.length > 0) {
              const groupByArgs = {
                by: optimizedPlan.groupBy,
                where: stageWhere,
                _count: true,
                ...(optimizedPlan.metrics && optimizedPlan.metrics.length > 0 ? {
                  _sum: aggArgs._sum,
                  _avg: aggArgs._avg
                } : {})
              };
              rows = await model.groupBy(groupByArgs).catch(() => []);
            } else {
              const aggResult = await model.aggregate(aggArgs).catch(() => null);
              rows = aggResult ? [aggResult] : [];
            }

            const countVal = rows[0]?._count;
            const hasResults = rows.length > 0 && (
              countVal === undefined || 
              (typeof countVal === 'number' && countVal > 0) ||
              (typeof countVal === 'object' && countVal !== null && Object.values(countVal).some((v: any) => v > 0))
            );

            if (hasResults) {
              this.logger.log(`[Multi-Stage Search Aggregate] Succeeded at Stage ${stage}`);
              break;
            }
          }
          results.push(...rows);
        } else {
          // Default: Fetch rows
          let includeOptions: any = undefined;
          if (ent.toLowerCase() === 'property') {
            includeOptions = { owner: { select: { name: true, phone: true } } };
          } else if (ent.toLowerCase() === 'employeeprofile') {
            includeOptions = { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } };
          } else if (ent.toLowerCase() === 'lead' || ent.toLowerCase() === 'task') {
            includeOptions = { assignedTo: { select: { firstName: true, lastName: true, email: true } } };
          }

          let rows: any[] = [];
          for (let stage = 1; stage <= 4; stage++) {
            if (stage === 4) {
              // Fuzzy matching via local Levenshtein filtering for string values
              const searchStr = (cleanFilters.location || cleanFilters.name || cleanFilters.firstName);
              if (searchStr && typeof searchStr === 'string') {
                try {
                  const allRecords = await model.findMany({
                    where: this.tenantIsolationService.injectTenantFilter(ent, {}, organizationId),
                    include: includeOptions
                  });
                  const cleanSearch = searchStr.toLowerCase().trim();
                  rows = allRecords.filter((rec: any) => {
                    const loc = (rec.location || '').toLowerCase();
                    const fName = (rec.user?.firstName || rec.firstName || rec.name || '').toLowerCase();
                    return loc.includes(cleanSearch) || cleanSearch.includes(loc) ||
                           fName.includes(cleanSearch) || cleanSearch.includes(fName) ||
                           (loc.length > 2 && this.levenshtein(loc, cleanSearch) <= 3) ||
                           (fName.length > 2 && this.levenshtein(fName, cleanSearch) <= 3);
                  }).slice(0, optimizedPlan.take);
                  if (rows.length > 0) {
                    this.logger.log(`[Multi-Stage Search Fetch] Succeeded at Stage 4 (Fuzzy local match)`);
                    break;
                  }
                } catch (e) {
                  this.logger.warn(`Stage 4 fuzzy match local failed: ${e.message}`);
                }
              }
            }

            const stageWhere = this.buildStageWhereClause(whereClause, stage);
            rows = await model.findMany({
              where: stageWhere,
              include: includeOptions,
              take: optimizedPlan.take,
              orderBy: { createdAt: 'desc' } as any
            }).catch(async () => {
              return await model.findMany({
                where: stageWhere,
                include: includeOptions,
                take: optimizedPlan.take
              }).catch(() => []);
            });

            if (rows.length > 0) {
              this.logger.log(`[Multi-Stage Search Fetch] Succeeded at Stage ${stage}`);
              break;
            }
          }

          // Salary masking rule
          if (ent.toLowerCase() === 'employeeprofile') {
            const canViewSalaries = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(userRole);
            const sanitized = rows.map((emp: any) => {
              const copy = { ...emp };
              if (!canViewSalaries && emp.userId !== userId) {
                copy.salary = "CONFIDENTIAL (Access Denied)";
              }
              return copy;
            });
            results.push(...sanitized);
          } else {
            results.push(...rows);
          }
        }
      } catch (err) {
        this.logger.error(`Postgres execution error on model ${modelKey}: ${err.message}`);
      }
    }

    return results;
  }

  // Layer 7: Result Verification Engine
  verifyResults(rows: any[]): { isVerified: boolean; businessError?: string } {
    this.logger.log(`[Layer 7: Result Verification] Verifying results for business rule violations`);

    for (const r of rows) {
      if (!r) continue;
      // 1. Negative numbers rule (e.g. salaries, prices, commissions cannot be negative)
      if (r.salary !== undefined && typeof r.salary === 'number' && r.salary < 0) {
        return { isVerified: false, businessError: 'Negative salary detected: violates business accounting bounds.' };
      }
      if (r.price !== undefined && typeof r.price === 'number' && r.price < 0) {
        return { isVerified: false, businessError: 'Negative listing price detected: violates business bounds.' };
      }
      if (r.netSalary !== undefined && typeof r.netSalary === 'number' && r.netSalary < 0) {
        return { isVerified: false, businessError: 'Negative Net Salary detected: payroll anomaly.' };
      }
      if (r.budget !== undefined && typeof r.budget === 'number' && r.budget < 0) {
        return { isVerified: false, businessError: 'Negative client budget detected: violates CRM rules.' };
      }
    }

    return { isVerified: true };
  }

  // Layer 8: SQL Confidence Engine
  calculateSQLConfidence(
    queryText: string,
    plan: any,
    rows: any[],
    isValid: boolean,
    isVerified: boolean
  ): number {
    this.logger.log(`[Layer 8: SQL Confidence Engine] Calculating retrieval confidence`);
    if (!isValid) return 0;

    let confidence = 100;

    // Deduct if verification failed
    if (!isVerified) confidence -= 30;

    // Deduct for empty records
    if (!rows || rows.length === 0) {
      confidence -= 15;
    }

    // Deduct for planning complexity
    if (plan.entities && plan.entities.length > 1) {
      confidence -= 5; // Multi-join queries have slightly lower certainty
    }

    return Math.max(0, Math.min(100, confidence));
  }

  // Entry Point: Run the entire Database Retrieval Pipeline
  async runDatabaseRetrievalPipeline(
    queryText: string,
    organizationId: string,
    userId: string,
    userRole: string,
    prePlannedNode?: any
  ): Promise<DatabasePipelineResult> {
    const errors: string[] = [];
    const queriesRun: string[] = [];

    let plan: any;
    if (prePlannedNode) {
      this.logger.log(`[Database Pipeline] Reusing pre-planned DAG node parameters. Bypassing NL-to-SQL LLM.`);
      plan = prePlannedNode;
    } else {
      // Layer 2: Semantic Mapping
      const mapping = this.semanticMapping(queryText);

      // Layer 3: NL-to-SQL
      plan = await this.generateQueryPlan(
        queryText,
        mapping.mappedEntities,
        organizationId,
        userId,
        userRole
      );
    }
    queriesRun.push(`Prisma Query Plan on [${plan.entities.join(', ')}]`);

    // Layer 4 & 5: SQL Validation & Optimization
    const validation = this.validateAndOptimizeQuery(plan, userRole);
    if (!validation.isValid) {
      errors.push(validation.errorMsg || 'Query validation failed.');
      return {
        rows: [],
        verified: false,
        confidenceScore: 0,
        tablesUsed: plan.entities,
        queriesRun,
        errors,
        rawLlmResponse: plan._rawLlmResponse,
        parseError: plan._parseError,
        generatedPlan: plan,
        validationResult: validation
      };
    }

    // Layer 6: Execution
    const rows = await this.executeDatabaseQuery(
      validation.optimizedPlan,
      organizationId,
      userId,
      userRole
    );

    // Layer 7: Verification
    const verification = this.verifyResults(rows);
    if (!verification.isVerified) {
      errors.push(verification.businessError || 'Result verification failed.');
    }

    // Layer 8: Confidence Calculation
    const confidenceScore = this.calculateSQLConfidence(
      queryText,
      validation.optimizedPlan,
      rows,
      validation.isValid,
      verification.isVerified
    );

    return {
      rows,
      verified: verification.isVerified,
      confidenceScore,
      tablesUsed: plan.entities,
      queriesRun,
      errors,
      rawLlmResponse: plan._rawLlmResponse,
      parseError: plan._parseError,
      generatedPlan: plan,
      validationResult: validation
    };
  }
}

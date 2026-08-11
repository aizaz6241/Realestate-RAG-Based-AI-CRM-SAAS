export interface SchemaColumn {
  name: string;
  type: string;
  synonyms: string[];
  isRelevantByDefaultForAnalytics: boolean;
  description?: string;
}

export interface SchemaRelationship {
  targetTable: string;
  foreignKey: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
}

export interface SchemaTable {
  name: string;
  synonyms: string[];
  description: string;
  columns: SchemaColumn[];
  relationships: SchemaRelationship[];
}

export const SchemaDictionary: Record<string, SchemaTable> = {
  Organization: {
    name: 'Organization',
    synonyms: ["company","business","tenant","firm"],
    description: 'Stores records for Organization.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'domain', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'logo', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'description', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'businessLocation', type: 'string', synonyms: ["location","address"], isRelevantByDefaultForAnalytics: true },
      { name: 'phone', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'email', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'taxId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'users', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'properties', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'leads', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfiles', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'clients', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'tasks', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'owners', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'documents', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'vehicles', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'chatRooms', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'calendarEvents', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'aiDocuments', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'aiChatSessions', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'aiMemoryVectors', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'integrationConfigs', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'communicationTemplates', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'integrationLogs', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'subscription', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'apiUsageLogs', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'aiPendingApprovals', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'aiActiveDrafts', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
    ]
  },
  User: {
    name: 'User',
    synonyms: ["employee","agent","staff","manager","personnel","team member"],
    description: 'Stores records for User.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'email', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'passwordHash', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'firstName', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'lastName', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'role', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'isActive', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'isSystemAdmin', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'assignedProperties', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'assignedLeads', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfile', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'clients', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'assignedTasks', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'assignedOwners', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'keyCheckouts', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'messages', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'aiDocuments', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'aiChatSessions', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'apiUsageLogs', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'Document', foreignKey: 'id', type: 'one-to-many' },
      { targetTable: 'DocumentVersion', foreignKey: 'id', type: 'one-to-many' },
      { targetTable: 'ChatRoom', foreignKey: 'id', type: 'one-to-many' },
      { targetTable: 'Task', foreignKey: 'id', type: 'one-to-many' },
      { targetTable: 'CalendarEvent', foreignKey: 'id', type: 'one-to-many' },
    ]
  },
  EmployeeProfile: {
    name: 'EmployeeProfile',
    synonyms: [],
    description: 'Stores records for EmployeeProfile.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'userId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'department', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'designation', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'joiningDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'salary', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'documents', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'attendances', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'leaveRequests', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'activities', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'reviews', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'payrolls', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'driverProfile', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'User', foreignKey: 'userId', type: 'many-to-one' },
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  EmployeeDocument: {
    name: 'EmployeeDocument',
    synonyms: [],
    description: 'Stores records for EmployeeDocument.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'category', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'fileUrl', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'uploadedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfileId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'EmployeeProfile', foreignKey: 'employeeProfileId', type: 'many-to-one' },
    ]
  },
  Attendance: {
    name: 'Attendance',
    synonyms: ["presence","absence","check in","check out"],
    description: 'Tracks employee check-ins, check-outs, and absences.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'dateStr', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'checkIn', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'checkOut', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'checkoutSummary', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfileId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'EmployeeProfile', foreignKey: 'employeeProfileId', type: 'many-to-one' },
    ]
  },
  LeaveRequest: {
    name: 'LeaveRequest',
    synonyms: ["vacation","time off","sick leave","absence","holiday"],
    description: 'Tracks employee leave requests (vacations, sick leaves).',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'startDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'endDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'type', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'reason', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'approvedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfileId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'EmployeeProfile', foreignKey: 'employeeProfileId', type: 'many-to-one' },
    ]
  },
  ActivityLog: {
    name: 'ActivityLog',
    synonyms: [],
    description: 'Stores records for ActivityLog.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'description', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'category', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'logTime', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'startTime', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'endTime', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'duration', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfileId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'EmployeeProfile', foreignKey: 'employeeProfileId', type: 'many-to-one' },
    ]
  },
  PerformanceReview: {
    name: 'PerformanceReview',
    synonyms: [],
    description: 'Stores records for PerformanceReview.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'reviewDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'rating', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'feedback', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'reviewedById', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfileId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'EmployeeProfile', foreignKey: 'employeeProfileId', type: 'many-to-one' },
    ]
  },
  Property: {
    name: 'Property',
    synonyms: ["real estate","listing","unit","apartment","house","villa","commercial space","inventory"],
    description: 'Stores real estate properties.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'title', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'description', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'type', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'listingType', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'price', type: 'number', synonyms: ["amount","cost","value","sales","revenue"], isRelevantByDefaultForAnalytics: true },
      { name: 'location', type: 'string', synonyms: ["city","region","area","dubai"], isRelevantByDefaultForAnalytics: true },
      { name: 'bedrooms', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'bathrooms', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'areaSqft', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'images', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'amenities', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'assignedToId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'ownerId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'clientInterests', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'clientViewings', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'priceHistory', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'keyTracker', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'assignedToId', type: 'many-to-one' },
      { targetTable: 'Owner', foreignKey: 'ownerId', type: 'many-to-one' },
    ]
  },
  Lead: {
    name: 'Lead',
    synonyms: ["prospect","potential client","inquiry"],
    description: 'Stores potential clients or prospects before they are converted.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'email', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'phone', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'source', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'score', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'isDuplicate', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'duplicateOfId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'notes', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'assignedToId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'activities', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'assignedToId', type: 'many-to-one' },
    ]
  },
  Client: {
    name: 'Client',
    synonyms: ["customer","buyer","tenant","investor","seller"],
    description: 'Stores converted leads or active customers/clients.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'email', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'phone', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'type', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'address', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'assignedToId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'stage', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'budget', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'preferences', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'interestedProperties', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'viewings', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'communications', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'assignedToId', type: 'many-to-one' },
    ]
  },
  Task: {
    name: 'Task',
    synonyms: [],
    description: 'Stores records for Task.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'title', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'description', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'dueDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'assignedToId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdById', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'assignedToId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'createdById', type: 'many-to-one' },
    ]
  },
  Owner: {
    name: 'Owner',
    synonyms: [],
    description: 'Stores records for Owner.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'email', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'phone', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'kycVerified', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'kycNotes', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'commissionRate', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'agreementUrl', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'agreementExpiry', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'assignedToId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'properties', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'communications', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'documents', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'assignedToId', type: 'many-to-one' },
    ]
  },
  OwnerCommunication: {
    name: 'OwnerCommunication',
    synonyms: [],
    description: 'Stores records for OwnerCommunication.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'type', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'summary', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'date', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'ownerId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Owner', foreignKey: 'ownerId', type: 'many-to-one' },
    ]
  },
  OwnerDocument: {
    name: 'OwnerDocument',
    synonyms: [],
    description: 'Stores records for OwnerDocument.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'fileUrl', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'uploadedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'ownerId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Owner', foreignKey: 'ownerId', type: 'many-to-one' },
    ]
  },
  ClientPropertyInterest: {
    name: 'ClientPropertyInterest',
    synonyms: [],
    description: 'Stores records for ClientPropertyInterest.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'clientId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'propertyId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Client', foreignKey: 'clientId', type: 'many-to-one' },
      { targetTable: 'Property', foreignKey: 'propertyId', type: 'many-to-one' },
    ]
  },
  ClientViewing: {
    name: 'ClientViewing',
    synonyms: [],
    description: 'Stores records for ClientViewing.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'viewingDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'feedback', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'clientId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'propertyId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Client', foreignKey: 'clientId', type: 'many-to-one' },
      { targetTable: 'Property', foreignKey: 'propertyId', type: 'many-to-one' },
    ]
  },
  ClientCommunication: {
    name: 'ClientCommunication',
    synonyms: [],
    description: 'Stores records for ClientCommunication.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'type', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'summary', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'date', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'clientId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Client', foreignKey: 'clientId', type: 'many-to-one' },
    ]
  },
  Payroll: {
    name: 'Payroll',
    synonyms: ["salary","wage","pay","compensation"],
    description: 'Tracks employee salaries and payrolls.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'month', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'baseSalary', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'allowances', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'deductions', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'netSalary', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'paidAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfileId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'EmployeeProfile', foreignKey: 'employeeProfileId', type: 'many-to-one' },
    ]
  },
  PropertyPriceHistory: {
    name: 'PropertyPriceHistory',
    synonyms: [],
    description: 'Stores records for PropertyPriceHistory.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'price', type: 'number', synonyms: ["amount","cost","value","sales","revenue"], isRelevantByDefaultForAnalytics: true },
      { name: 'changeDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'propertyId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Property', foreignKey: 'propertyId', type: 'many-to-one' },
    ]
  },
  Document: {
    name: 'Document',
    synonyms: [],
    description: 'Stores records for Document.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'category', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'fileUrl', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'version', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'tags', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'expiryDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'isExpired', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'accessRole', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'targetRoles', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'targetUserIds', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'writeRoles', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'writeUserIds', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'createdById', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'versions', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'createdById', type: 'many-to-one' },
    ]
  },
  DocumentVersion: {
    name: 'DocumentVersion',
    synonyms: [],
    description: 'Stores records for DocumentVersion.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'version', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'fileUrl', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'documentId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'updatedById', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Document', foreignKey: 'documentId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'updatedById', type: 'many-to-one' },
    ]
  },
  DriverProfile: {
    name: 'DriverProfile',
    synonyms: [],
    description: 'Stores records for DriverProfile.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'licenseNumber', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'employeeProfileId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'schedules', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'EmployeeProfile', foreignKey: 'employeeProfileId', type: 'many-to-one' },
    ]
  },
  Vehicle: {
    name: 'Vehicle',
    synonyms: [],
    description: 'Stores records for Vehicle.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'modelName', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'plateNumber', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'maintenanceRequests', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'schedules', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  VehicleMaintenance: {
    name: 'VehicleMaintenance',
    synonyms: [],
    description: 'Stores records for VehicleMaintenance.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'description', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'cost', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'requestDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'completionDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'vehicleId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Vehicle', foreignKey: 'vehicleId', type: 'many-to-one' },
    ]
  },
  LogisticsSchedule: {
    name: 'LogisticsSchedule',
    synonyms: [],
    description: 'Stores records for LogisticsSchedule.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'visitDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'pickupLocation', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'dropLocation', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'driverId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'vehicleId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'viewingId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'DriverProfile', foreignKey: 'driverId', type: 'many-to-one' },
      { targetTable: 'Vehicle', foreignKey: 'vehicleId', type: 'many-to-one' },
    ]
  },
  KeyTracker: {
    name: 'KeyTracker',
    synonyms: [],
    description: 'Stores records for KeyTracker.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'keyTag', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'propertyId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'checkouts', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Property', foreignKey: 'propertyId', type: 'many-to-one' },
    ]
  },
  KeyCheckout: {
    name: 'KeyCheckout',
    synonyms: [],
    description: 'Stores records for KeyCheckout.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'checkoutDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'returnDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'notes', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'keyId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'userId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'KeyTracker', foreignKey: 'keyId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'userId', type: 'many-to-one' },
    ]
  },
  LeadActivity: {
    name: 'LeadActivity',
    synonyms: [],
    description: 'Stores records for LeadActivity.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'type', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'description', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'activityDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'leadId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Lead', foreignKey: 'leadId', type: 'many-to-one' },
    ]
  },
  ChatRoom: {
    name: 'ChatRoom',
    synonyms: [],
    description: 'Stores records for ChatRoom.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'isGroup', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'isSystem', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'systemUserId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'messages', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'id', type: 'one-to-many' },
    ]
  },
  Message: {
    name: 'Message',
    synonyms: [],
    description: 'Stores records for Message.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'content', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'isSystem', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'chatRoomId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'senderId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'ChatRoom', foreignKey: 'chatRoomId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'senderId', type: 'many-to-one' },
    ]
  },
  CalendarEvent: {
    name: 'CalendarEvent',
    synonyms: [],
    description: 'Stores records for CalendarEvent.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'title', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'description', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'startTime', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'endTime', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'location', type: 'string', synonyms: ["city","region","area","dubai"], isRelevantByDefaultForAnalytics: true },
      { name: 'isPrivate', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'targetRoles', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'targetUserIds', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'createdById', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'createdById', type: 'many-to-one' },
    ]
  },
  AiDocument: {
    name: 'AiDocument',
    synonyms: [],
    description: 'Stores records for AiDocument.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'fileUrl', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'fileType', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'fileSize', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'version', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'metadata', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'createdById', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'chunks', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'createdById', type: 'many-to-one' },
    ]
  },
  AiDocumentChunk: {
    name: 'AiDocumentChunk',
    synonyms: [],
    description: 'Stores records for AiDocumentChunk.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'content', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'embedding', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'metadata', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'documentId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'AiDocument', foreignKey: 'documentId', type: 'many-to-one' },
    ]
  },
  AiChatSession: {
    name: 'AiChatSession',
    synonyms: [],
    description: 'Stores records for AiChatSession.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'title', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'userId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'messages', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'User', foreignKey: 'userId', type: 'many-to-one' },
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  IntegrationConfig: {
    name: 'IntegrationConfig',
    synonyms: [],
    description: 'Stores records for IntegrationConfig.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'type', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'isEnabled', type: 'boolean', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'credentials', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  CommunicationTemplate: {
    name: 'CommunicationTemplate',
    synonyms: [],
    description: 'Stores records for CommunicationTemplate.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'name', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'subject', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'content', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'channel', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  IntegrationLog: {
    name: 'IntegrationLog',
    synonyms: [],
    description: 'Stores records for IntegrationLog.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'channel', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'direction', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'payload', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'errorMessage', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'leadId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  AiMemoryVector: {
    name: 'AiMemoryVector',
    synonyms: [],
    description: 'Stores records for AiMemoryVector.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'category', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'content', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'embedding', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'clientId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'userId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'propertyId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  Subscription: {
    name: 'Subscription',
    synonyms: ["plan","billing","package"],
    description: 'Stores records for Subscription.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'plan', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'monthlyPrice', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'currency', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'startDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'endDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'nextBillingDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'paymentStatus', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'amountPaidThisCycle', type: 'number', synonyms: ["revenue","sales","collected"], isRelevantByDefaultForAnalytics: true },
      { name: 'amountPending', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'lastPaymentDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'billingCycle', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'contractTerms', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'payments', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  SubscriptionPayment: {
    name: 'SubscriptionPayment',
    synonyms: [],
    description: 'Stores records for SubscriptionPayment.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'subscriptionId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'amount', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'currency', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'status', type: 'string', synonyms: ["state","condition"], isRelevantByDefaultForAnalytics: true },
      { name: 'paymentDate', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'billingPeriod', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Subscription', foreignKey: 'subscriptionId', type: 'many-to-one' },
    ]
  },
  ApiUsageLog: {
    name: 'ApiUsageLog',
    synonyms: [],
    description: 'Stores records for ApiUsageLog.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'userId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'serviceName', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'modelName', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'type', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'requestCount', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'promptTokens', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'completionTokens', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'totalTokens', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
      { targetTable: 'User', foreignKey: 'userId', type: 'many-to-one' },
    ]
  },
  AiPendingApproval: {
    name: 'AiPendingApproval',
    synonyms: [],
    description: 'Stores records for AiPendingApproval.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'userId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'userRole', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'userMessage', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'sessionId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'callPersona', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'executionGraph', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'toolCallIndex', type: 'number', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'executedResults', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'historyJson', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'expiresAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
  AiActiveDraft: {
    name: 'AiActiveDraft',
    synonyms: [],
    description: 'Stores records for AiActiveDraft.',
    columns: [
      { name: 'id', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'organizationId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: false },
      { name: 'userId', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'draftType', type: 'string', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'draftData', type: 'object', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'expiresAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: true },
      { name: 'createdAt', type: 'datetime', synonyms: ["date","created date"], isRelevantByDefaultForAnalytics: false },
      { name: 'updatedAt', type: 'datetime', synonyms: [], isRelevantByDefaultForAnalytics: false },
    ],
    relationships: [
      { targetTable: 'Organization', foreignKey: 'organizationId', type: 'many-to-one' },
    ]
  },
};

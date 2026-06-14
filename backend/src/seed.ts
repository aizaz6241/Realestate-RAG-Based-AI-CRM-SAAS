import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

async function main() {
  try {
    // Test connection first with a real query to verify active database reachability (bypasses isolated build-time network blocks)
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.warn("⚠️ [Zorvex Deploy Alert] Database server is unreachable at this stage (possibly build-time isolated network on Render).");
    console.warn("⚠️ Gracefully skipping database seeding to allow the build compilation to succeed.");
    return;
  }

  console.log("🚀 Starting extensive ERP database clean-up...");

  // 1. Delete all existing records using robust PostgreSQL TRUNCATE CASCADE
  const tableNames = [
    'Message',
    'ChatRoom',
    'CalendarEvent',
    'AiDocumentChunk',
    'AiDocument',
    'AiChatSession',
    'IntegrationLog',
    'CommunicationTemplate',
    'IntegrationConfig',
    'LeadActivity',
    'KeyCheckout',
    'KeyTracker',
    'LogisticsSchedule',
    'VehicleMaintenance',
    'Vehicle',
    'DriverProfile',
    'EmployeeDocument',
    'Attendance',
    'LeaveRequest',
    'ActivityLog',
    'PerformanceReview',
    'Payroll',
    'ClientViewing',
    'ClientPropertyInterest',
    'ClientCommunication',
    'OwnerCommunication',
    'OwnerDocument',
    'EmployeeProfile',
    'PropertyPriceHistory',
    'Property',
    'Owner',
    'Task',
    'Lead',
    'Client',
    'DocumentVersion',
    'Document',
    'SubscriptionPayment',
    'Subscription',
    'ApiUsageLog',
    'User',
    'Organization'
  ];

  for (const tableName of tableNames) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" CASCADE;`);
    } catch (err) {
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableName} CASCADE;`);
      } catch (e) {
        console.log(`⚠️ Skip truncating table ${tableName}: ${e}`);
      }
    }
  }

  console.log("🧹 Database cleared successfully.");
  console.log("🌱 Seeding premium multi-tenant ERP system...");

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: "Zorvex",
      domain: "zorvex.com"
    }
  });
  console.log(`🏢 Created Organization: ${org.name}`);

  // 3. Hash Passwords
  const passwordHash = await bcrypt.hash("admin123", 10);

  // 4. Create Users for all core Roles
  const usersData = [
    { email: "admin@zorvex.com", firstName: "Admin", lastName: "User", role: Role.SUPER_ADMIN, isSystemAdmin: true },
    { email: "tenant-admin@zorvex.com", firstName: "Tenant", lastName: "Admin", role: Role.SUPER_ADMIN, isSystemAdmin: false },
    { email: "aizazkhan6241@gmail.com", firstName: "Muhammad Aizaz", lastName: "Khan", role: Role.HR, isSystemAdmin: false },
    { email: "agent1@zorvex.com", firstName: "John", lastName: "Agent", role: Role.AGENT, isSystemAdmin: false },
    { email: "agent2@zorvex.com", firstName: "Sarah", lastName: "Agent", role: Role.AGENT, isSystemAdmin: false },
    { email: "manager@zorvex.com", firstName: "Robert", lastName: "Manager", role: Role.SALES_MANAGER, isSystemAdmin: false },
    { email: "sijad@gmail.com", firstName: "Sijad", lastName: "Ullah", role: Role.LOGISTICS, isSystemAdmin: false },
    { email: "finance@zorvex.com", firstName: "Faisal", lastName: "Finance", role: Role.FINANCE, isSystemAdmin: false }
  ];

  const users: { [key: string]: any } = {};
  for (const u of usersData) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isSystemAdmin: u.isSystemAdmin,
        organizationId: org.id
      }
    });
    users[u.email] = user;
    console.log(`👤 Created User: ${user.email} (${user.role})`);
  }

  // 5. Create Employee Profiles for each User
  const profilesData = [
    { email: "admin@zorvex.com", department: "Administration", designation: "Executive Director", salary: 35000 },
    { email: "tenant-admin@zorvex.com", department: "Administration", designation: "Tenant General Manager", salary: 25000 },
    { email: "aizazkhan6241@gmail.com", department: "Human Resources", designation: "HR Manager", salary: 15000 },
    { email: "agent1@zorvex.com", department: "Sales", designation: "Senior Property Consultant", salary: 12000 },
    { email: "agent2@zorvex.com", department: "Sales", designation: "Junior Property Consultant", salary: 10000 },
    { email: "manager@zorvex.com", department: "Sales", designation: "Sales Director", salary: 22000 },
    { email: "sijad@gmail.com", department: "Logistics", designation: "Logistics Lead & Driver", salary: 8500 },
    { email: "finance@zorvex.com", department: "Finance", designation: "Finance Controller", salary: 16000 }
  ];

  const profiles: { [key: string]: any } = {};
  for (const p of profilesData) {
    const user = users[p.email];
    const profile = await prisma.employeeProfile.create({
      data: {
        userId: user.id,
        department: p.department,
        designation: p.designation,
        salary: p.salary,
        joiningDate: new Date("2025-01-15"),
        status: "ACTIVE",
        organizationId: org.id
      }
    });
    profiles[p.email] = profile;
    console.log(`💼 Created Profile for: ${p.email}`);
  }

  // 6. Create Driver Profile for Logistics Driver (Sijad Ullah)
  const driverProfile = await prisma.driverProfile.create({
    data: {
      licenseNumber: "DL-AE-982736152",
      status: "AVAILABLE",
      employeeProfileId: profiles["sijad@gmail.com"].id
    }
  });
  console.log(`🚗 Created Driver Profile for Sijad Ullah`);

  // 7. Create Vehicles for Logistics
  const vehicles = [
    await prisma.vehicle.create({
      data: { modelName: "Toyota Hiace VIP Commuter", plateNumber: "DXB-A-98234", status: "ACTIVE", organizationId: org.id }
    }),
    await prisma.vehicle.create({
      data: { modelName: "Tesla Model Y (Executive)", plateNumber: "DXB-M-48291", status: "ACTIVE", organizationId: org.id }
    }),
    await prisma.vehicle.create({
      data: { modelName: "Nissan Urvan Cargo Van", plateNumber: "DXB-C-19402", status: "MAINTENANCE", organizationId: org.id }
    })
  ];
  console.log(`🚚 Created ${vehicles.length} Logistics Fleet Vehicles`);

  // 8. Create Vehicle Maintenance request for the Nissan Urvan
  await prisma.vehicleMaintenance.create({
    data: {
      description: "Complete AC Compressor replacement & regular fluid check.",
      cost: 1750,
      status: "PENDING",
      vehicleId: vehicles[2].id
    }
  });
  console.log(`🔧 Logged maintenance request for Nissan Urvan`);

  // 9. Create Logistics Schedules
  const scheduleToday = await prisma.logisticsSchedule.create({
    data: {
      visitDate: new Date(),
      pickupLocation: "Dubai Marina Yacht Club",
      dropLocation: "Burj Khalifa District, Downtown Dubai",
      status: "SCHEDULED",
      driverId: driverProfile.id,
      vehicleId: vehicles[0].id
    }
  });
  const scheduleYesterday = await prisma.logisticsSchedule.create({
    data: {
      visitDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      pickupLocation: "Jumeirah Beach Residence",
      dropLocation: "Business Bay Central",
      status: "COMPLETED",
      driverId: driverProfile.id,
      vehicleId: vehicles[0].id
    }
  });
  console.log(`📅 Scheduled Logistics schedules (today & completed yesterday)`);

  // 10. Create Landlords / Owners
  const owners = [
    await prisma.owner.create({
      data: {
        name: "Fahad Al-Mansoori",
        email: "fahad.mansoori@gmail.com",
        phone: "+971501234567",
        status: "ACTIVE",
        kycVerified: true,
        kycNotes: "Emirates ID and Signature Villa Title Deed verified on 2025-05-15.",
        commissionRate: 2.0,
        organizationId: org.id,
        assignedToId: users["agent1@zorvex.com"].id
      }
    }),
    await prisma.owner.create({
      data: {
        name: "Elena Rostova",
        email: "elena.rostova@outlook.com",
        phone: "+971559876543",
        status: "ACTIVE",
        kycVerified: true,
        kycNotes: "Passport Copy & Burj Penthouse Exclusivity verified.",
        commissionRate: 2.5,
        organizationId: org.id,
        assignedToId: users["agent2@zorvex.com"].id
      }
    }),
    await prisma.owner.create({
      data: {
        name: "Marcus Sterling",
        email: "marcus.sterling@gmail.com",
        phone: "+971521112222",
        status: "ACTIVE",
        kycVerified: false,
        kycNotes: "Awaiting title deed verification for Waterfront studio.",
        commissionRate: 5.0,
        organizationId: org.id,
        assignedToId: users["manager@zorvex.com"].id
      }
    })
  ];
  console.log(`🏡 Created ${owners.length} Emirates Property Landlords / Owners`);

  // 11. Create Owner Documents & Communications
  await prisma.ownerDocument.create({
    data: { name: "Emirates ID Card - Fahad", fileUrl: "https://zorvex-erp.s3.amazonaws.com/docs/eid_fahad.pdf", ownerId: owners[0].id }
  });
  await prisma.ownerDocument.create({
    data: { name: "Title Deed - Palm Villa 14", fileUrl: "https://zorvex-erp.s3.amazonaws.com/docs/title_deed_palm.pdf", ownerId: owners[0].id }
  });
  await prisma.ownerCommunication.create({
    data: { type: "CALL", summary: "Discussed the Palm Villa exclusivity extension. Fahad agreed to 2% commission rate.", ownerId: owners[0].id }
  });
  console.log(`📝 Logged landlord documents & communications`);

  // 12. Create Properties (Villas, Apartments, Penthouse)
  const properties = [
    await prisma.property.create({
      data: {
        title: "Palm Jumeirah Signature Villa",
        description: "Stunning 6-bedroom beachfront luxury villa with sweeping sea views, infinity pool, and private beach access.",
        type: "VILLA",
        status: "PUBLISHED",
        listingType: "SALE",
        price: 35000000,
        location: "Palm Jumeirah, Dubai, UAE",
        bedrooms: 6,
        bathrooms: 7,
        areaSqft: 8500,
        images: ["https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80"],
        amenities: ["Private Pool", "Beach Access", "Private Gym", "Smart Home Automation", "24/7 Security"],
        organizationId: org.id,
        assignedToId: users["agent1@zorvex.com"].id,
        ownerId: owners[0].id
      }
    }),
    await prisma.property.create({
      data: {
        title: "Downtown Dubai Luxury Penthouse",
        description: "Exquisite 3-bedroom penthouse offering breathtaking direct views of the Burj Khalifa and Dubai Fountain.",
        type: "APARTMENT",
        status: "PUBLISHED",
        listingType: "SALE",
        price: 12500000,
        location: "Burj Khalifa District, Downtown Dubai, UAE",
        bedrooms: 3,
        bathrooms: 4,
        areaSqft: 3200,
        images: ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80"],
        amenities: ["Burj Khalifa View", "Fountain View", "Shared Pool", "Concierge", "Valet Parking"],
        organizationId: org.id,
        assignedToId: users["agent2@zorvex.com"].id,
        ownerId: owners[1].id
      }
    }),
    await prisma.property.create({
      data: {
        title: "Dubai Marina Waterfront Apartment",
        description: "High-floor cozy 1-bedroom apartment overlooking the glamorous Yacht Marina harbor. Near Metro.",
        type: "APARTMENT",
        status: "PUBLISHED",
        listingType: "RENT",
        price: 110000,
        location: "Marina Heights, Dubai Marina, UAE",
        bedrooms: 1,
        bathrooms: 2,
        areaSqft: 950,
        images: ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80"],
        amenities: ["Marina View", "Metro Access", "Shared Gym", "Shared Pool", "Built-in Wardrobes"],
        organizationId: org.id,
        assignedToId: users["agent1@zorvex.com"].id,
        ownerId: owners[2].id
      }
    }),
    await prisma.property.create({
      data: {
        title: "Emirates Hills Mega Mansion",
        description: "Ultra-exclusive multi-floor mansion in Sector E with a bespoke infinity pool overlooking the golf course.",
        type: "VILLA",
        status: "DRAFT",
        listingType: "SALE",
        price: 68000000,
        location: "Sector E, Emirates Hills, Dubai, UAE",
        bedrooms: 7,
        bathrooms: 9,
        areaSqft: 15400,
        images: ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"],
        amenities: ["Golf Course View", "Infinity Pool", "Private Cinema", "Staff Quarters", "Grand Foyer"],
        organizationId: org.id,
        assignedToId: users["manager@zorvex.com"].id,
        ownerId: owners[0].id
      }
    })
  ];
  console.log(`🏠 Created ${properties.length} Premium Property Listings`);

  // 13. Create Property Price History
  await prisma.propertyPriceHistory.create({
    data: { price: 34000000, changeDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), propertyId: properties[0].id }
  });
  await prisma.propertyPriceHistory.create({
    data: { price: 35000000, changeDate: new Date(), propertyId: properties[0].id }
  });
  console.log(`📈 Logged price fluctuations for Palm Signature Villa`);

  // 14. Create CRM Clients (Buyers & Investors)
  const clients = [
    await prisma.client.create({
      data: {
        name: "Aisha Al-Hashimi",
        email: "aisha.hashimi@outlook.com",
        phone: "+971504445555",
        type: "BUYER",
        stage: "VIEWING",
        budget: 15000000,
        preferences: "Looking for premium penthouse or villa in Palm Jumeirah or Downtown Dubai.",
        organizationId: org.id,
        assignedToId: users["agent2@zorvex.com"].id
      }
    }),
    await prisma.client.create({
      data: {
        name: "Vikram Malhotra",
        email: "vikram.malhotra@gmail.com",
        phone: "+971559871111",
        type: "INVESTOR",
        stage: "OFFER",
        budget: 50000000,
        preferences: "Bulk purchase of multiple high-ROI apartments in Dubai Marina.",
        organizationId: org.id,
        assignedToId: users["agent1@zorvex.com"].id
      }
    }),
    await prisma.client.create({
      data: {
        name: "Jean-Pierre",
        email: "jp.dubai@outlook.com",
        phone: "+971521119999",
        type: "BUYER",
        stage: "INQUIRY",
        budget: 35000000,
        preferences: "Ultra-luxury beachfront villa with immediate handover.",
        organizationId: org.id,
        assignedToId: users["manager@zorvex.com"].id
      }
    })
  ];
  console.log(`👥 Created ${clients.length} Active CRM Clients`);

  // 15. Link Property Interests
  await prisma.clientPropertyInterest.create({ data: { clientId: clients[0].id, propertyId: properties[0].id } });
  await prisma.clientPropertyInterest.create({ data: { clientId: clients[0].id, propertyId: properties[1].id } });
  await prisma.clientPropertyInterest.create({ data: { clientId: clients[1].id, propertyId: properties[2].id } });
  console.log(`🔗 Linked client property interests`);

  // 16. Log Client communications & viewings
  await prisma.clientViewing.create({
    data: {
      viewingDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      status: "SCHEDULED",
      clientId: clients[0].id,
      propertyId: properties[1].id
    }
  });
  await prisma.clientViewing.create({
    data: {
      viewingDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      feedback: "Vikram loved the Marina Heights location, wants to proceed with bulk offer of 2 units.",
      status: "COMPLETED",
      clientId: clients[1].id,
      propertyId: properties[2].id
    }
  });
  await prisma.clientCommunication.create({
    data: { type: "WHATSAPP", summary: "Dispatched Palm signature villa digital brochure PDF.", clientId: clients[0].id }
  });
  await prisma.clientCommunication.create({
    data: { type: "CALL", summary: "Spoke to Vikram regarding the 2-unit bulk offer financing terms.", clientId: clients[1].id }
  });
  console.log(`💬 Populated client viewings timeline and chat histories`);

  // 17. Create Leads CRM Database
  const leads = [
    await prisma.lead.create({
      data: {
        name: "Tariq Mahmood",
        email: "tariq.mahmood@yahoo.com",
        phone: "+971563334444",
        source: "PROPERTY_FINDER",
        status: "NEW",
        score: 35,
        organizationId: org.id,
        assignedToId: users["agent1@zorvex.com"].id
      }
    }),
    await prisma.lead.create({
      data: {
        name: "Emily Watson",
        email: "emily.watson@gmail.com",
        phone: "+971501982736",
        source: "WEBSITE",
        status: "ENGAGED",
        score: 85,
        organizationId: org.id,
        assignedToId: users["agent2@zorvex.com"].id
      }
    }),
    await prisma.lead.create({
      data: {
        name: "Youssef Haddad",
        email: "youssef.haddad@hotmail.com",
        phone: "+971529990000",
        source: "DIRECT",
        status: "CONTACTED",
        score: 50,
        organizationId: org.id,
        assignedToId: users["agent1@zorvex.com"].id
      }
    })
  ];
  console.log(`🎯 Seeded ${leads.length} Inbound Leads`);

  // 18. Create Lead Activity logs
  await prisma.leadActivity.create({
    data: { description: "Lead qualified via Vapi.ai Voicebot. Client expressed interest in Penthouse.", type: "CALL", leadId: leads[1].id }
  });
  await prisma.leadActivity.create({
    data: { description: "Shared Property Finder listing link and verified phone details.", type: "EMAIL", leadId: leads[2].id }
  });
  console.log(`📅 Populated Lead Activity timeline logs`);

  // 19. Create Documents Vault
  const docs = [
    await prisma.document.create({
      data: {
        name: "Palm Villa Exclusivity Listing Agreement",
        category: "SALES",
        fileUrl: "https://zorvex-erp.s3.amazonaws.com/docs/exclusivity_palm.pdf",
        accessRole: "AGENT",
        tags: ["exclusivity", "agreement", "palm jumeirah"],
        createdById: users["admin@zorvex.com"].id,
        organizationId: org.id
      }
    }),
    await prisma.document.create({
      data: {
        name: "Zorvex Corporate Employee Handbook 2026",
        category: "CORPORATE",
        fileUrl: "https://zorvex-erp.s3.amazonaws.com/docs/handbook.pdf",
        accessRole: "VIEWER",
        tags: ["handbook", "policies", "compliance"],
        createdById: users["admin@zorvex.com"].id,
        organizationId: org.id
      }
    }),
    await prisma.document.create({
      data: {
        name: "Burj Khalifa Penthouse Title Deed Copy",
        category: "KYC",
        fileUrl: "https://zorvex-erp.s3.amazonaws.com/docs/title_deed_burj.pdf",
        accessRole: "ADMIN",
        tags: ["deed", "dld", "kyc", "downtown"],
        createdById: users["admin@zorvex.com"].id,
        organizationId: org.id
      }
    })
  ];
  console.log(`📂 Created ${docs.length} Vault Documents`);

  // 20. Create Employee Profile Documents
  await prisma.employeeDocument.create({
    data: {
      name: "Emirates ID Card - Muhammad Aizaz",
      category: "ID",
      fileUrl: "https://zorvex-erp.s3.amazonaws.com/docs/eid_aizaz.pdf",
      employeeProfileId: profiles["aizazkhan6241@gmail.com"].id
    }
  });
  await prisma.employeeDocument.create({
    data: {
      name: "Employment Contract - John Agent",
      category: "CONTRACT",
      fileUrl: "https://zorvex-erp.s3.amazonaws.com/docs/contract_john.pdf",
      employeeProfileId: profiles["agent1@zorvex.com"].id
    }
  });
  console.log(`📎 Uploaded Employee HR credentials`);

  // 21. Create HR Leave Requests (Seeded first to construct matching Attendance logs)
  const leaveRequestsData = [
    // tenant-admin@zorvex.com (Nabih's account)
    {
      startDate: new Date("2026-02-10T09:00:00Z"),
      endDate: new Date("2026-02-15T18:00:00Z"),
      type: "ANNUAL",
      status: "APPROVED",
      reason: "Annual family holiday trip.",
      approvedAt: new Date("2026-02-01T10:00:00Z"),
      employeeProfileId: profiles["tenant-admin@zorvex.com"].id
    },
    {
      startDate: new Date("2026-04-12T09:00:00Z"),
      endDate: new Date("2026-04-14T18:00:00Z"),
      type: "SICK",
      status: "APPROVED",
      reason: "Recovery from minor surgery.",
      approvedAt: new Date("2026-04-12T08:00:00Z"),
      employeeProfileId: profiles["tenant-admin@zorvex.com"].id
    },
    {
      startDate: new Date("2026-05-05T09:00:00Z"),
      endDate: new Date("2026-05-06T18:00:00Z"),
      type: "CASUAL",
      status: "REJECTED",
      reason: "Urgent personal bank visit.",
      employeeProfileId: profiles["tenant-admin@zorvex.com"].id
    },
    // aizazkhan6241@gmail.com (Aizaz's account)
    {
      startDate: new Date("2026-01-05T09:00:00Z"),
      endDate: new Date("2026-01-09T18:00:00Z"),
      type: "ANNUAL",
      status: "APPROVED",
      reason: "Winter family vacation in Murree.",
      approvedAt: new Date("2025-12-28T11:00:00Z"),
      employeeProfileId: profiles["aizazkhan6241@gmail.com"].id
    },
    {
      startDate: new Date("2026-03-20T09:00:00Z"),
      endDate: new Date("2026-03-21T18:00:00Z"),
      type: "SICK",
      status: "APPROVED",
      reason: "Dental checkup and extraction.",
      approvedAt: new Date("2026-03-20T08:30:00Z"),
      employeeProfileId: profiles["aizazkhan6241@gmail.com"].id
    },
    // agent2
    {
      startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      type: "ANNUAL",
      status: "PENDING",
      reason: "Visiting family overseas in Tbilisi, Georgia.",
      employeeProfileId: profiles["agent2@zorvex.com"].id
    },
    // agent1
    {
      startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      type: "SICK",
      status: "APPROVED",
      reason: "Severe dental procedure appointment.",
      approvedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      employeeProfileId: profiles["agent1@zorvex.com"].id
    }
  ];

  for (const lr of leaveRequestsData) {
    await prisma.leaveRequest.create({ data: lr });
  }
  console.log(`🏖️ Seeded leave requests (approved sick, rejected casual, pending annual)`);

  // Build a set of approved leave days in format 'profileId_YYYY-MM-DD'
  const approvedLeaveDays = new Set<string>();
  for (const lr of leaveRequestsData) {
    if (lr.status === "APPROVED") {
      const start = new Date(lr.startDate);
      const end = new Date(lr.endDate);
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dStr = d.toISOString().split('T')[0];
        approvedLeaveDays.add(`${lr.employeeProfileId}_${dStr}`);
      }
    }
  }

  // 22. Create HR Attendance records (Past 6 Months - natural data)
  console.log("⏱️ Generating natural daily attendance records (past 6 months)...");
  const attendanceRecords: any[] = [];
  const attendanceStartDate = new Date("2025-12-15");
  const attendanceEndDate = new Date("2026-06-14");

  for (const email of Object.keys(profiles)) {
    const prof = profiles[email];
    
    for (const d = new Date(attendanceStartDate); d <= attendanceEndDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      
      const dateStr = d.toISOString().split('T')[0];
      const leaveKey = `${prof.id}_${dateStr}`;
      
      if (approvedLeaveDays.has(leaveKey)) {
        attendanceRecords.push({
          dateStr,
          checkIn: null,
          checkOut: null,
          status: "ON_LEAVE",
          checkoutSummary: "On approved leave.",
          employeeProfileId: prof.id
        });
        continue;
      }
      
      // Pseudo-random factor based on profile ID and date to vary behaviors
      const seedVal = Math.sin(d.getTime() + prof.id.charCodeAt(0) + prof.id.charCodeAt(prof.id.length - 1)) * 10000;
      const fraction = seedVal - Math.floor(seedVal);
      
      let status = "PRESENT";
      let checkIn: Date | null = null;
      let checkOut: Date | null = null;
      let checkoutSummary = "Completed routine dashboard checklist & tasks.";
      
      if (fraction < 0.03) {
        status = "ABSENT";
        checkoutSummary = "Absent from work.";
      } else if (fraction < 0.12) {
        status = "LATE";
        // Late check-in: 09:15 AM to 10:05 AM
        const lateMin = Math.floor(fraction * 50) + 15;
        checkIn = new Date(`${dateStr}T09:${lateMin < 10 ? '0' + lateMin : lateMin}:15Z`);
        checkOut = new Date(`${dateStr}T18:05:00Z`);
        checkoutSummary = "Arrived late due to commute delay. Handled delayed follow-ups.";
      } else {
        // Present check-in: 08:35 AM to 08:58 AM
        const presMin = Math.floor(fraction * 23) + 35;
        checkIn = new Date(`${dateStr}T08:${presMin}:10Z`);
        // Present check-out: 05:45 PM to 06:15 PM
        const outMin = Math.floor(fraction * 30) + 45;
        checkOut = new Date(`${dateStr}T17:${outMin}:45Z`);
      }
      
      attendanceRecords.push({
        dateStr,
        checkIn,
        checkOut,
        status,
        checkoutSummary,
        employeeProfileId: prof.id
      });
    }
  }

  // Bulk create attendance logs in chunks of 100
  const attendanceChunkSize = 100;
  for (let i = 0; i < attendanceRecords.length; i += attendanceChunkSize) {
    const chunk = attendanceRecords.slice(i, i + attendanceChunkSize);
    await prisma.attendance.createMany({
      data: chunk,
      skipDuplicates: true
    });
  }
  console.log(`⏱️ Populated 6 months of daily attendance logs (${attendanceRecords.length} records) for all employees.`);

  // 23. Log Work Activities
  await prisma.activityLog.create({
    data: { description: "Conducted sales negotiation meeting at Dubai Marina office.", category: "MEETING", duration: 90, employeeProfileId: profiles["agent1@zorvex.com"].id }
  });
  await prisma.activityLog.create({
    data: { description: "Wrote property listing brochures for Palm Jumeirah signature villa.", category: "WORK", duration: 180, employeeProfileId: profiles["agent1@zorvex.com"].id }
  });
  console.log(`💻 Logged employee work activities`);

  // 24. Create Performance Reviews (Audit ratings)
  await prisma.performanceReview.create({
    data: {
      rating: 5,
      feedback: "John has performed spectacularly this quarter. Successfully brought in beachfront properties and managed high-profile buyers flawlessly.",
      reviewedById: users["admin@zorvex.com"].id,
      employeeProfileId: profiles["agent1@zorvex.com"].id
    }
  });
  await prisma.performanceReview.create({
    data: {
      rating: 4,
      feedback: "Sarah shows incredible dedication to client viewing pipelines. Needs minor support on closed deals conversion rates.",
      reviewedById: users["admin@zorvex.com"].id,
      employeeProfileId: profiles["agent2@zorvex.com"].id
    }
  });
  console.log(`⭐ Seeded employee performance review cards`);

  // 25. Populate Payrolls (Last 6 Months - natural data)
  const payrollMonths = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
  for (const prof of Object.values(profiles)) {
    const base = prof.salary || 10000;
    
    for (const m of payrollMonths) {
      const monthInt = parseInt(m.split("-")[1]);
      // Vary calculations slightly based on month index to make data natural
      const seedNoise = Math.sin(prof.salary + monthInt) * 150;
      
      const allowance = Math.round((base * 0.05) + Math.abs(seedNoise));
      const deduction = Math.round((base * 0.012) + Math.abs(seedNoise * 0.1));
      const net = base + allowance - deduction;
      
      await prisma.payroll.create({
        data: {
          month: m,
          baseSalary: base,
          allowances: allowance,
          deductions: deduction,
          netSalary: net,
          status: "PAID",
          paidAt: new Date(`${m}-28T10:00:00Z`),
          employeeProfileId: prof.id
        }
      });
    }
  }
  console.log(`💳 Seeded payroll histories (last 6 months with allowances/deductions) for all workers`);

  // 26. Create Tasks Kanban Board
  await prisma.task.create({
    data: {
      title: "Schedule physical viewing with Vikram Malhotra",
      description: "Vikram wants to view the high-floor Marina Heights studio apartment. Evening preferences.",
      status: "PENDING",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      organizationId: org.id,
      assignedToId: users["agent1@zorvex.com"].id,
      createdById: users["admin@zorvex.com"].id
    }
  });
  await prisma.task.create({
    data: {
      title: "Verify Title Deed documents for Burj Penthouse",
      description: "Perform real-time verification of Elena's deed registration at the Dubai Land Department portal.",
      status: "IN_PROGRESS",
      dueDate: new Date(),
      organizationId: org.id,
      assignedToId: users["agent2@zorvex.com"].id,
      createdById: users["admin@zorvex.com"].id
    }
  });
  await prisma.task.create({
    data: {
      title: "Refactor Palm Villa imagery coordinates",
      description: "Update the localized geocoding maps coordinates to match exact Palm signature location.",
      status: "COMPLETED",
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      organizationId: org.id,
      assignedToId: users["manager@zorvex.com"].id,
      createdById: users["admin@zorvex.com"].id
    }
  });
  console.log(`📋 Created Tasks Kanban Checklist`);

  // 27. Seed SMTP/Twilio Configuration Templates
  await prisma.communicationTemplate.create({
    data: {
      name: "Waterfront Brochure Dispatch",
      subject: "Premium Yacht Harbour Living at Dubai Marina",
      content: "Hello {{leadName}},\n\nFollowing up on our conversation, I'm delighted to share the exclusive brochure for the Dubai Marina Waterfront Apartment. Let me know if you would like to schedule a viewing.\n\nBest regards,\n{{agentName}}",
      channel: "EMAIL",
      organizationId: org.id
    }
  });
  await prisma.communicationTemplate.create({
    data: {
      name: "SMS OTP Security Code",
      subject: "OTP Verification",
      content: "Your Zorvex secure verification code is: 582914. Valid for 5 minutes.",
      channel: "SMS",
      organizationId: org.id
    }
  });
  console.log(`📨 Seeded email & SMS templates`);

  // 28. Seed SaaS Billing, Subscriptions, Payments & AI Usage Logs
  console.log("🌱 Seeding SaaS Owner metrics...");
  
  // Zorvex Subscription (Active & Paid)
  const zorvexSub = await prisma.subscription.create({
    data: {
      organizationId: org.id,
      plan: "PREMIUM",
      status: "ACTIVE",
      monthlyPrice: 5000.0,
      currency: "AED",
      startDate: new Date("2026-01-01"),
      nextBillingDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // Due in 25 days
      paymentStatus: "PAID",
      amountPaidThisCycle: 5000.0,
      amountPending: 0.0,
      lastPaymentDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      contractTerms: "Zorvex Real Estate Ecosystem standard Premium agreement. Includes full CRM, floating AI assistant, and unlimited WhatsApp integrations."
    }
  });

  await prisma.subscriptionPayment.createMany({
    data: [
      { subscriptionId: zorvexSub.id, amount: 5000.0, status: "SUCCESS", paymentDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), billingPeriod: "2026-06" },
      { subscriptionId: zorvexSub.id, amount: 5000.0, status: "SUCCESS", paymentDate: new Date("2026-05-01"), billingPeriod: "2026-05" },
      { subscriptionId: zorvexSub.id, amount: 5000.0, status: "SUCCESS", paymentDate: new Date("2026-04-01"), billingPeriod: "2026-04" },
    ]
  });

  // Al Hamra Properties Organization (Overdue & Partial Payment)
  const hamraOrg = await prisma.organization.create({
    data: {
      name: "Al Hamra Properties",
      domain: "alhamra.ae"
    }
  });

  const hamraAdmin = await prisma.user.create({
    data: {
      email: "admin@alhamra.ae",
      passwordHash,
      firstName: "Imran",
      lastName: "Shaikh",
      role: Role.SUPER_ADMIN,
      isSystemAdmin: false,
      organizationId: hamraOrg.id
    }
  });

  const hamraSub = await prisma.subscription.create({
    data: {
      organizationId: hamraOrg.id,
      plan: "STANDARD",
      status: "OVERDUE",
      monthlyPrice: 3000.0,
      currency: "AED",
      startDate: new Date("2026-03-01"),
      nextBillingDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Due 2 days ago!
      paymentStatus: "PARTIAL",
      amountPaidThisCycle: 1000.0,
      amountPending: 2000.0,
      lastPaymentDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Paid 1000 yesterday
      contractTerms: "Al Hamra Real Estate standard agreement. 3000 AED per month. Standard CRM features. Dedicated AI assistant included."
    }
  });

  await prisma.subscriptionPayment.createMany({
    data: [
      { subscriptionId: hamraSub.id, amount: 1000.0, status: "SUCCESS", paymentDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), billingPeriod: "2026-06" }, // partial payment
      { subscriptionId: hamraSub.id, amount: 3000.0, status: "SUCCESS", paymentDate: new Date("2026-05-02"), billingPeriod: "2026-05" },
      { subscriptionId: hamraSub.id, amount: 3000.0, status: "SUCCESS", paymentDate: new Date("2026-04-02"), billingPeriod: "2026-04" },
    ]
  });

  // Seed basic CRM data for Al Hamra Properties to populate its dashboard
  const hamraOwner = await prisma.owner.create({
    data: {
      name: "Yousef Al-Hosani",
      email: "yousef.hosani@gmail.com",
      phone: "+971509998888",
      status: "ACTIVE",
      organizationId: hamraOrg.id,
      assignedToId: hamraAdmin.id
    }
  });

  await prisma.property.create({
    data: {
      title: "Al Hamra Village Townhouse",
      description: "Charming 3-bedroom townhouse near the golf club and beach in Al Hamra Village, Ras Al Khaimah.",
      type: "VILLA",
      status: "PUBLISHED",
      listingType: "RENT",
      price: 85000,
      location: "Al Hamra Village, Ras Al Khaimah, UAE",
      bedrooms: 3,
      bathrooms: 4,
      areaSqft: 2700,
      images: ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"],
      organizationId: hamraOrg.id,
      assignedToId: hamraAdmin.id,
      ownerId: hamraOwner.id
    }
  });

  await prisma.lead.create({
    data: {
      name: "Mustafa Kamal",
      email: "mustafa@gmail.com",
      phone: "+971523334444",
      source: "WEBSITE",
      status: "NEW",
      score: 65,
      organizationId: hamraOrg.id,
      assignedToId: hamraAdmin.id
    }
  });

  await prisma.client.create({
    data: {
      name: "Fatima Al-Suwaidi",
      email: "fatima.suwaidi@gmail.com",
      phone: "+971556667777",
      type: "BUYER",
      organizationId: hamraOrg.id,
      assignedToId: hamraAdmin.id,
      stage: "INQUIRY",
      budget: 1500000
    }
  });

  await prisma.task.create({
    data: {
      title: "Call landlord for key access",
      description: "Discuss scheduling a viewing for the townhouse.",
      status: "PENDING",
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      organizationId: hamraOrg.id,
      assignedToId: hamraAdmin.id
    }
  });

  // Seed AI usage logs for last 30 days
  const services = ["Ollama", "Gemini", "OpenAI"];
  const models: Record<string, string> = {
    Ollama: "meta-llama/llama-3.1-8b-instruct",
    Gemini: "gemini-2.0-flash",
    OpenAI: "gpt-4o-mini"
  };

  const usageLogs: any[] = [];
  const now = new Date();
  
  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const logDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    
    // Zorvex Usage
    services.forEach(service => {
      const isOllama = service === "Ollama";
      const isGemini = service === "Gemini";
      
      const count = isOllama ? Math.floor(Math.random() * 40) + 15 
                  : isGemini ? Math.floor(Math.random() * 25) + 5
                  : Math.floor(Math.random() * 10) + 1;
      
      const promptTok = count * (Math.floor(Math.random() * 200) + 100);
      const complTok = count * (Math.floor(Math.random() * 300) + 150);
      
      usageLogs.push({
        organizationId: org.id,
        userId: users["admin@zorvex.com"].id,
        serviceName: service,
        modelName: models[service],
        type: "TEXT_GENERATION",
        requestCount: count,
        promptTokens: promptTok,
        completionTokens: complTok,
        totalTokens: promptTok + complTok,
        createdAt: logDate
      });
      
      const embedCount = count * 2;
      const embedTokens = embedCount * 150;
      usageLogs.push({
        organizationId: org.id,
        userId: users["admin@zorvex.com"].id,
        serviceName: service,
        modelName: isOllama ? "nomic-embed-text" : isGemini ? "gemini-embedding-001" : "text-embedding-3-small",
        type: "EMBEDDING",
        requestCount: embedCount,
        promptTokens: embedTokens,
        completionTokens: 0,
        totalTokens: embedTokens,
        createdAt: logDate
      });
    });

    // Al Hamra Usage
    services.forEach(service => {
      const isOllama = service === "Ollama";
      const isGemini = service === "Gemini";
      
      const count = isOllama ? Math.floor(Math.random() * 25) + 5 
                  : isGemini ? Math.floor(Math.random() * 15) + 2
                  : Math.floor(Math.random() * 5) + 1;
      
      const promptTok = count * (Math.floor(Math.random() * 180) + 80);
      const complTok = count * (Math.floor(Math.random() * 250) + 120);
      
      usageLogs.push({
        organizationId: hamraOrg.id,
        userId: hamraAdmin.id,
        serviceName: service,
        modelName: models[service],
        type: "TEXT_GENERATION",
        requestCount: count,
        promptTokens: promptTok,
        completionTokens: complTok,
        totalTokens: promptTok + complTok,
        createdAt: logDate
      });
    });
  }

  const chunkSize = 50;
  for (let i = 0; i < usageLogs.length; i += chunkSize) {
    const chunk = usageLogs.slice(i, i + chunkSize);
    await prisma.apiUsageLog.createMany({
      data: chunk
    });
  }

  console.log(`📊 Seeded ${usageLogs.length} AI API Usage Log items.`);

  console.log("✨ database seeding complete! 100% data fidelity reached. ✨");
}

main()
  .catch(e => {
    const errorMessage = e?.message || String(e);
    const isConnError = 
      errorMessage.includes("Can't reach database server") ||
      errorMessage.includes("PrismaClientInitializationError") ||
      e?.code === 'P1001' || 
      e?.code === 'P1002' ||
      e?.code === 'P1008' ||
      e?.code === 'P1017';

    if (isConnError) {
      console.warn("⚠️ [Zorvex Deploy Alert] Database connection failed during seeding.");
      console.warn(errorMessage);
      console.warn("⚠️ Gracefully exiting with code 0 to allow build to succeed.");
      process.exit(0);
    } else {
      console.error("❌ Seeding Error encountered:", e);
      process.exit(1);
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

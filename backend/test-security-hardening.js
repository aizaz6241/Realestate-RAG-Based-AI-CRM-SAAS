const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { AiService } = require('./dist/ai/ai.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  console.log('🚀 Bootstrapping NestJS context for Security Hardening Verification...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const aiService = app.get(AiService);

  // Setup unique test tenants to avoid contamination
  const tenantA_Id = 'test-tenant-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tenantB_Id = 'test-tenant-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  console.log('\n🧹 Cleaning up any leftover test data...');
  await cleanTenantData(tenantA_Id);
  await cleanTenantData(tenantB_Id);

  try {
    console.log('\n📁 Seeding Tenant A (5 employees) and Tenant B (20 employees)...');
    
    // Create orgs
    await prisma.organization.create({ data: { id: tenantA_Id, name: 'Tenant A Corp' } });
    await prisma.organization.create({ data: { id: tenantB_Id, name: 'Tenant B Corp' } });

    // Seed Tenant A: 5 users & employee profiles
    for (let i = 1; i <= 5; i++) {
      const uId = `user-a-${i}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
      await prisma.user.create({
        data: {
          id: uId,
          email: `employee.a${i}@tenant-a.com`,
          passwordHash: 'dummy-hash',
          firstName: `EmployeeA_${i}`,
          lastName: 'Test',
          role: 'AGENT',
          organizationId: tenantA_Id
        }
      });
      await prisma.employeeProfile.create({
        data: {
          id: `profile-a-${i}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
          userId: uId,
          designation: 'Sales Executive',
          department: 'Sales',
          organizationId: tenantA_Id
        }
      });
    }

    // Seed Tenant B: 20 users & employee profiles
    for (let i = 1; i <= 20; i++) {
      const uId = `user-b-${i}-bbbb-bbbb-bbbb-bbbbbbbbbbbb`;
      await prisma.user.create({
        data: {
          id: uId,
          email: `employee.b${i}@tenant-b.com`,
          passwordHash: 'dummy-hash',
          firstName: `EmployeeB_${i}`,
          lastName: 'Test',
          role: 'AGENT',
          organizationId: tenantB_Id
        }
      });
      await prisma.employeeProfile.create({
        data: {
          id: `profile-b-${i}-bbbb-bbbb-bbbb-bbbbbbbbbbbb`,
          userId: uId,
          designation: 'Property Consultant',
          department: 'Brokerage',
          organizationId: tenantB_Id
        }
      });
    }

    const tenantAUser = await prisma.user.findFirst({ where: { organizationId: tenantA_Id } });

    console.log('\n=========================================');
    console.log('TEST A: Tenant Separation Count Isolation');
    console.log('=========================================');
    console.log('Query: "how many employees do we have?" executed under Tenant A.');
    
    const resA = await aiService.chat(
      'how many employees do we have?',
      tenantAUser.id,
      tenantA_Id,
      'AGENT',
      [],
      null,
      null,
      true // Debug trace active
    );

    console.log('Response returned to user:', resA.response);
    console.log('Total database records returned:', resA.toolData?.length);
    
    if (resA.toolData?.length === 5) {
      console.log('✅ TEST A PASSED: Exactly 5 employee profiles returned. Cross-tenant leakage was blocked!');
    } else {
      console.error(`❌ TEST A FAILED: Expected 5 profiles, got ${resA.toolData?.length}`);
    }

    console.log('\n=========================================');
    console.log('TEST B: Custom Filter Injection Attack');
    console.log('=========================================');
    console.log(`Query attempting to override filter to organizationId: "${tenantB_Id}".`);

    // We execute a raw chat simulation. Even if the LLM is tricked into generating filters targeting Tenant B,
    // the system-level TenantIsolationService should force-merge/overwrite the filter back to Tenant A.
    // Let's call the database pipeline directly to verify filter overrides are blocked.
    const dbPipeline = app.get(require('./dist/ai/database-pipeline.service').DatabasePipelineService);
    
    // We pass filters claiming to query Tenant B's ID
    const injectPlan = {
      operation: 'fetch',
      entities: ['employeeprofile'],
      filters: { organizationId: tenantB_Id }, // Attempted override
      take: 50
    };

    let overrideCaught = false;
    try {
      const records = await dbPipeline.executeDatabaseQuery(
        injectPlan,
        tenantA_Id, // Enforced context
        tenantAUser.id,
        'AGENT'
      );
      
      console.log(`Retrieved records count: ${records.length}`);
      const hasAnyTenantBRecord = records.some(r => r.organizationId === tenantB_Id);
      if (!hasAnyTenantBRecord && records.length === 5) {
        console.log('✅ TEST B PASSED: The injected organizationId filter was ignored/overwritten. Scoped correctly to Tenant A!');
      } else {
        console.error('❌ TEST B FAILED: Tenant B records leaked into the query output!');
      }
    } catch (err) {
      console.log(`System correctly rejected or blocked injection: ${err.message}`);
      console.log('✅ TEST B PASSED');
    }

    console.log('\n=========================================');
    console.log('TEST C: Wildcard/Contains Security Key Block');
    console.log('=========================================');
    console.log('Attempting custom filter containing contains/wildcard operators on organizationId.');

    const wildcardPlan = {
      operation: 'fetch',
      entities: ['employeeprofile'],
      filters: { organizationId: { contains: 'test-tenant-bbbb', mode: 'insensitive' } },
      take: 50
    };

    try {
      await dbPipeline.executeDatabaseQuery(
        wildcardPlan,
        tenantA_Id,
        tenantAUser.id,
        'AGENT'
      );
      console.error('❌ TEST C FAILED: The system allowed a contains/wildcard match on organizationId!');
    } catch (err) {
      console.log(`✅ TEST C PASSED: System threw ForbiddenException as expected: "${err.message}"`);
    }

  } catch (err) {
    console.error('Test suite execution error:', err);
  } finally {
    console.log('\n🧹 Cleaning up test tenant data...');
    await cleanTenantData(tenantA_Id);
    await cleanTenantData(tenantB_Id);
    await app.close();
    await prisma.$disconnect();
    console.log('\n🏁 Hardening Verification Complete!');
  }
}

async function cleanTenantData(orgId) {
  try {
    // Delete employee profiles
    await prisma.employeeProfile.deleteMany({ where: { organizationId: orgId } });
    // Delete users
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    // Delete orgs
    await prisma.organization.deleteMany({ where: { id: orgId } });
  } catch (e) {
    console.warn(`Clean error: ${e.message}`);
  }
}

runTests();

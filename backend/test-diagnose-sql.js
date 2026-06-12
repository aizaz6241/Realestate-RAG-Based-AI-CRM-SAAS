const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runDiagnostic() {
  console.log('🔬 Starting SQL Pipeline Fallback Diagnostic Investigation...\n');
  
  const org = await prisma.organization.findFirst();
  const user = await prisma.user.findFirst();
  if (!org || !user) {
    console.error('❌ Organization or User missing.');
    process.exit(1);
  }

  // Import build output dist services
  const { DatabasePipelineService } = require('./dist/ai/database-pipeline.service');
  const { AiLlmService } = require('./dist/ai/ai-llm.service');

  const llmService = new AiLlmService(prisma);
  const dbPipelineService = new DatabasePipelineService(prisma, llmService);

  // --- SCENARIO 1: Simulated JSON_PARSE_ERROR (LLM returned comments) ---
  console.log('=========================================');
  console.log('SCENARIO 1: JSON_PARSE_ERROR (Comments in LLM response)');
  console.log('=========================================');
  
  const rawResponseWithComments = `{
    "operation": "fetch",
    "entities": ["employeeprofile"],
    "filters": {}, // Standard Prisma where clause representation
    "take": 50 // Optional take limit
  }`;

  let parsed1 = null;
  let error1 = null;
  try {
    const jsonStart = rawResponseWithComments.indexOf('{');
    const jsonEnd = rawResponseWithComments.lastIndexOf('}');
    parsed1 = JSON.parse(rawResponseWithComments.substring(jsonStart, jsonEnd + 1));
  } catch (e) {
    error1 = e;
  }

  console.log('1. Raw LLM query plan output:');
  console.log(rawResponseWithComments);
  console.log('\n2. Parsed query plan:');
  console.log(parsed1);
  console.log('\n3. Actual Parse Error and Exception Stack:');
  if (error1) {
    console.log(`Error Message: ${error1.message}`);
    console.log(`Stack Trace:\n${error1.stack}`);
  }
  console.log('\n4. Fallback Trigger Reason:');
  console.log(`fallbackReason: "JSON_PARSE_ERROR"`);

  // --- SCENARIO 2: Simulated PRISMA_EXECUTION_ERROR (Schema mismatch / Invalid column) ---
  console.log('\n=========================================');
  console.log('SCENARIO 2: PRISMA_EXECUTION_ERROR (Invalid column filter)');
  console.log('=========================================');
  
  const invalidPlan = {
    operation: 'fetch',
    entities: ['employeeprofile'],
    filters: {
      firstName: 'Faisal' // invalid column on employeeProfile
    },
    take: 50
  };

  console.log('1. Raw LLM query plan output (Mocked):');
  console.log(JSON.stringify(invalidPlan, null, 2));

  console.log('\n2. Parsed query plan:');
  console.log(invalidPlan);

  console.log('\n3. Validation result:');
  const validation2 = dbPipelineService.validateAndOptimizeQuery(invalidPlan, user.role);
  console.log(validation2);

  console.log('\n4. Prisma execution result and Exception Stack:');
  let prismaError = null;
  try {
    await dbPipelineService.executeDatabaseQuery(
      validation2.optimizedPlan,
      org.id,
      user.id,
      user.role
    );
  } catch (e) {
    prismaError = e;
  }
  
  if (prismaError) {
    console.log(`Error Message: ${prismaError.message}`);
    console.log(`Stack Trace:\n${prismaError.stack}`);
  } else {
    // Wait, in our executeDatabaseQuery, we catch the error internally!
    // Let's print what it does in database-pipeline.service.ts:
    // It logs: "Postgres execution error on model employeeProfile: ..."
    console.log(`Note: executeDatabaseQuery catches the exception internally and returns results as [].`);
  }

  console.log('\n5. Fallback Trigger Reason:');
  console.log(`fallbackReason: "PRISMA_EXECUTION_ERROR"`);

  // --- SCENARIO 3: Simulated VALIDATION_FAILED (Access Blocked / HR Payroll) ---
  console.log('\n=========================================');
  console.log('SCENARIO 3: VALIDATION_FAILED (Role-based access blocked)');
  console.log('=========================================');
  
  const blockedPlan = {
    operation: 'fetch',
    entities: ['payroll'],
    filters: {},
    take: 50
  };

  console.log('1. Raw LLM query plan output (Mocked):');
  console.log(JSON.stringify(blockedPlan, null, 2));

  console.log('\n2. Parsed query plan:');
  console.log(blockedPlan);

  console.log('\n3. Validation result:');
  // Pass non-admin role e.g. AGENT
  const validation3 = dbPipelineService.validateAndOptimizeQuery(blockedPlan, 'AGENT');
  console.log(validation3);

  console.log('\n4. Fallback Trigger Reason:');
  console.log(`fallbackReason: "VALIDATION_FAILED"`);
}

runDiagnostic()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

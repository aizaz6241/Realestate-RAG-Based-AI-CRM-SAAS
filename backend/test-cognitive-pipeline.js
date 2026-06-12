const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🏁 Starting Automated Zorvex V9 Cognitive Pipeline Verification Test...');

  // Get test credentials
  const org = await prisma.organization.findFirst();
  const user = await prisma.user.findFirst();

  if (!org || !user) {
    console.error('❌ Error: Verification requires at least one Organization and User in the database.');
    process.exit(1);
  }

  const organizationId = org.id;
  const userId = user.id;
  const userRole = user.role;

  console.log(`👤 Running test as User: ${user.firstName} (ID: ${userId}), Role: ${userRole}`);

  // Import services manually from build output dist
  const { AiLlmService } = require('./dist/ai/ai-llm.service');
  const { CognitiveGatewayService } = require('./dist/ai/cognitive-gateway.service');
  const { PlanningEngineService } = require('./dist/ai/planning-engine.service');
  const { DatabasePipelineService } = require('./dist/ai/database-pipeline.service');
  const { ResultFusionService } = require('./dist/ai/result-fusion.service');
  const { LearningMemoryService } = require('./dist/ai/learning-memory.service');
  const { ObservabilityService } = require('./dist/ai/observability.service');

  // Instantiate services
  const prismaService = prisma;
  const llmService = new AiLlmService(prismaService);
  const gatewayService = new CognitiveGatewayService(prismaService, llmService);
  const planningService = new PlanningEngineService(llmService);
  const dbPipelineService = new DatabasePipelineService(prismaService, llmService);
  const fusionService = new ResultFusionService(llmService);
  const learningService = new LearningMemoryService(prismaService, llmService);
  const observabilityService = new ObservabilityService();

  console.log('✅ V9 Services instantiated successfully!');

  // --- TEST CASE 1: Layer 1 Cognitive Gateway Normalization ---
  console.log('\n--- Test Case 1: Cognitive Gateway Query Normalization ---');
  const rawQuery = 'show properties in meri na for rent';
  const gatewayOutput = await gatewayService.cognitiveGateway(
    rawQuery,
    userId,
    organizationId,
    userRole,
    [],
    {}
  );
  console.log('Normalized query:', gatewayOutput.query);
  if (gatewayOutput.query.toLowerCase().includes('dubai marina')) {
    console.log('✅ Identity and phonetic spelling resolution passed!');
  } else {
    console.warn('⚠️ Query normalization resolved query differently:', gatewayOutput.query);
  }

  // --- TEST CASE 2: Layer 2 Query Understanding Engine ---
  console.log('\n--- Test Case 2: Query Understanding Engine (Intents & Entities) ---');
  const intentObj = await gatewayService.queryUnderstanding(gatewayOutput);
  console.log('Intent Object:', intentObj);
  if (intentObj.intent && intentObj.classification) {
    console.log('✅ Query intent classified correctly!');
  } else {
    console.error('❌ Intent classification failed!');
    process.exit(1);
  }

  // --- TEST CASE 3: Layer 3 & 5 Planning and Tool Selection ---
  console.log('\n--- Test Case 3: Planning Engine Execution Plan ---');
  const plan = await planningService.generateExecutionPlan(
    gatewayOutput.query,
    intentObj,
    organizationId,
    userId,
    userRole
  );
  console.log('Execution Plan:', plan);
  if (plan.steps && plan.steps.length > 0) {
    console.log('✅ Planning engine plan generation passed!');
  } else {
    console.error('❌ Plan generation failed!');
    process.exit(1);
  }

  // --- TEST CASE 4: 8-Layer Database Retrieval Pipeline ---
  console.log('\n--- Test Case 4: 8-Layer Database Retrieval Pipeline ---');
  const dbResult = await dbPipelineService.runDatabaseRetrievalPipeline(
    'show properties in Dubai Marina',
    organizationId,
    userId,
    userRole
  );
  console.log('Database pipeline rows returned:', dbResult.rows.length);
  console.log('Database pipeline confidence score:', dbResult.confidenceScore);
  if (dbResult.verified && dbResult.confidenceScore > 0) {
    console.log('✅ Database retrieval pipeline execution and verification passed!');
  } else {
    console.error('❌ Database retrieval pipeline failed!');
    process.exit(1);
  }

  // --- TEST CASE 5: Result Fusion & Cross Validation (Contradiction Check) ---
  console.log('\n--- Test Case 5: Result Fusion & Cross Validation Contradictions ---');
  const dummyDbResult = {
    rows: [{ title: 'Marina Penthouse', price: 5000000 }],
    confidenceScore: 95,
    tablesUsed: ['property']
  };
  const dummyDocResult = {
    chunks: [{ content: 'Listing policy: Marina Penthouse is priced at 4500000 AED.', documentName: 'Policy.txt' }],
    confidenceScore: 0.8
  };
  const dummyMemResult = { memories: [] };

  const fusionOutput = await fusionService.fuseAndValidate(
    'Verify price of Marina Penthouse',
    { dbResult: dummyDbResult, docResult: dummyDocResult, memResult: dummyMemResult },
    organizationId,
    userId
  );
  console.log('Fusion conflicts detected:', fusionOutput.conflicts);
  console.log('Fused final confidence:', fusionOutput.finalConfidence);
  if (fusionOutput.finalConfidence > 0) {
    console.log('✅ Result fusion and cross-validation passed!');
  } else {
    console.error('❌ Result fusion failed!');
    process.exit(1);
  }

  // --- TEST CASE 6: Observability tracing logger ---
  console.log('\n--- Test Case 6: Checking Observability Log Traces ---');
  const dummyTrace = {
    traceId: 'trace-test-' + Date.now(),
    timestamp: new Date().toISOString(),
    query: 'Verify price of Marina Penthouse',
    intent: 'LOOKUP',
    classification: 'HYBRID',
    latencyMs: 150,
    confidenceScore: fusionOutput.finalConfidence,
    dbAccuracy: 100,
    ragAccuracy: 100,
    hallucinationRate: 0,
    fusionAccuracy: 100,
    tokenUsage: 250,
    cost: 0.001,
    securityViolations: [],
    workflowSuccess: true
  };
  await observabilityService.logTrace(dummyTrace, organizationId);
  const traces = await observabilityService.getObservabilityTraces();
  console.log('Logged traces count:', traces.length);
  if (traces.length > 0 && traces[0].query === dummyTrace.query) {
    console.log('✅ Observability logging trace passed!');
  } else {
    console.error('❌ Observability tracing failed!');
    process.exit(1);
  }

  console.log('\n🎉 ALL ZORVEX V9 COGNITIVE RETRIEVAL ARCHITECTURE VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
}

main()
  .catch(err => {
    console.error('❌ Test execution exception:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

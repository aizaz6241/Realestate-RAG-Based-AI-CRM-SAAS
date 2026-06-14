const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import services manually since it's a raw Node execution runner
// We can mock dependencies or test the logical components of RAG directly via database/services
async function main() {
  console.log('🏁 Starting Automated RAG Pipeline Verification Test...');

  // 1. Get test parameters
  const org = await prisma.organization.findFirst();
  const user = await prisma.user.findFirst();

  if (!org || !user) {
    console.error('❌ Error: Verification requires at least one Organization and User in the database.');
    process.exit(1);
  }

  const organizationId = org.id;
  const userId = user.id;
  const userRole = user.role;

  console.log(`👤 Running test as User: ${user.firstName} (ID: ${userId}), Org: ${org.name} (ID: ${organizationId})`);

  // We will test using NestJS container if we can instantiate it, or we can instantiate the service classes directly by passing mocks.
  // Instantiating classes directly with database dependency is the most robust and fastest verification method.
  
  const { AiLlmService } = require('./dist/ai/ai-llm.service');
  const { AiRagIngestionService } = require('./dist/ai/rag/ai-rag-ingestion.service');
  const { AiRagRetrievalService } = require('./dist/ai/rag/ai-rag-retrieval.service');
  const { AiRagRerankerService } = require('./dist/ai/rag/ai-rag-reranker.service');
  const { AiRagCacheService } = require('./dist/ai/rag/ai-rag-cache.service');
  const { AiRagService } = require('./dist/ai/rag/ai-rag.service');
  const { AiRagEvaluatorService } = require('./dist/ai/rag/ai-rag-evaluator.service');

  // Instantiate services
  const prismaService = prisma;
  const llmService = new AiLlmService(prismaService);
  const ingestionService = new AiRagIngestionService(prismaService);
  const retrievalService = new AiRagRetrievalService(prismaService, llmService);
  const rerankerService = new AiRagRerankerService(llmService);
  const cacheService = new AiRagCacheService();
  const ragService = new AiRagService(
    prismaService,
    llmService,
    ingestionService,
    retrievalService,
    rerankerService,
    cacheService
  );
  const evaluatorService = new AiRagEvaluatorService(ragService);

  console.log('✅ Services instantiated successfully!');

  // --- TEST CASE 1: Ingestion & Duplicate Check ---
  console.log('\n--- Test Case 1: Ingesting Sample Real Estate Policy Document ---');
  const docName = `DHA-Listing-Policy-Test-${Date.now()}.txt`;
  const content = `DHA Listing Policy 2026.
Paragraph 1: All property listings in DHA Phase 6 must have a signed form A from the landlord before advertising. This forms the baseline of listing compliance. [Random salt: ${Math.random()}]

Paragraph 2: Commission rates for sales agents in 2026 are capped at 2.5% maximum of the deal size, unless approved by the Super Admin in writing.

Paragraph 3: Subletting apartments without tenant registration with the organization portal is strictly prohibited and results in a fine of 5000 AED.`;

  const buffer = Buffer.from(content, 'utf-8');
  
  const ingestResult = await ragService.ingestDocument(
    buffer,
    'TXT',
    docName,
    organizationId,
    userId,
    ['ADMIN', 'SUPER_ADMIN']
  );
  console.log('Ingest Result:', ingestResult);

  if (ingestResult.success && ingestResult.chunksCount > 0) {
    console.log('✅ Ingestion passed!');
  } else {
    console.error('❌ Ingestion failed!');
    process.exit(1);
  }

  // Duplicate check
  console.log('\n--- Test Case 2: Ingesting Exact Duplicate ---');
  const dupResult = await ragService.ingestDocument(
    buffer,
    'TXT',
    docName,
    organizationId,
    userId,
    ['ADMIN', 'SUPER_ADMIN']
  );
  console.log('Duplicate Ingest Result:', dupResult);
  if (dupResult.success && dupResult.chunksCount === 0 && dupResult.message.includes('already indexed')) {
    console.log('✅ Duplicate detection passed!');
  } else {
    console.error('❌ Duplicate detection failed!');
    process.exit(1);
  }

  // --- TEST CASE 3: In-context Query & Citations ---
  console.log('\n--- Test Case 3: Querying In-context Information ---');
  const validQuery = 'What are the commission split rates for sales agents in DHA?';
  const queryResult = await ragService.query(validQuery, organizationId, userId, userRole);
  console.log('Answer:', queryResult.answer);
  console.log('Citations:', queryResult.citations);
  console.log('Confidence Score:', queryResult.confidenceScore);
  console.log('Latency:', queryResult.latencyMs, 'ms');

  if (queryResult.answer && !queryResult.answer.includes('Insufficient evidence') && queryResult.citations.length > 0) {
    console.log('✅ In-context query passed!');
  } else {
    console.error('❌ In-context query failed (either no answer generated or citations missing)!');
    process.exit(1);
  }

  // --- TEST CASE 4: Caching Check ---
  console.log('\n--- Test Case 4: Verifying Cache Performance ---');
  const cachedResult = await ragService.query(validQuery, organizationId, userId, userRole);
  console.log('Cached Latency:', cachedResult.latencyMs, 'ms');
  console.log('Cached Flag:', cachedResult.cached);
  if (cachedResult.cached && cachedResult.latencyMs < 50) {
    console.log('✅ Caching passed!');
  } else {
    console.error('❌ Caching failed!');
    process.exit(1);
  }

  // --- TEST CASE 5: Out of Context / Hallucination Avoidance ---
  console.log('\n--- Test Case 5: Out of Context Query Fallback ---');
  const outOfContextQuery = 'How do I cook a pepperoni pizza on a charcoal grill?';
  const fallbackResult = await ragService.query(outOfContextQuery, organizationId, userId, userRole);
  console.log('Fallback Answer:', fallbackResult.answer);
  console.log('Fallback Citations:', fallbackResult.citations);
  console.log('Fallback Confidence Score:', fallbackResult.confidenceScore);

  if (fallbackResult.answer.includes('Insufficient evidence found') && fallbackResult.citations.length === 0) {
    console.log('✅ Hallucination avoidance passed!');
  } else {
    console.error('❌ Hallucination avoidance failed (system fabricated an answer)!');
    process.exit(1);
  }

  // --- TEST CASE 6: Trace logs verify ---
  console.log('\n--- Test Case 6: Checking Observability Traces ---');
  const traces = await ragService.getTraces();
  console.log('Number of trace logs found:', traces.length);
  if (traces.length >= 2) {
    console.log('Sample Trace Query:', traces[0].query);
    console.log('Sample Trace Status:', traces[0].status);
    console.log('✅ Observability tracing passed!');
  } else {
    console.error('❌ Observability tracing failed!');
    process.exit(1);
  }

  // --- TEST CASE 7: Continuous Evaluation Suite ---
  console.log('\n--- Test Case 7: Running Continuous Evaluation Pipeline ---');
  const evalSuite = await evaluatorService.runEvaluation(organizationId, userId, userRole);
  console.log('Evaluation Summary:', evalSuite.summary);
  if (evalSuite.summary.totalTests > 0) {
    console.log('✅ Evaluation pipeline passed!');
  } else {
    console.error('❌ Evaluation pipeline failed!');
    process.exit(1);
  }

  console.log('\n🎉 ALL RAG PIPELINE VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
}

main()
  .catch(err => {
    console.error('❌ Test execution exception:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

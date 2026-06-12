const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  const user = await prisma.user.findFirst();
  if (!org || !user) {
    console.error('❌ Organization or User missing.');
    process.exit(1);
  }

  // Import build output dist services
  const { AiLlmService } = require('./dist/ai/ai-llm.service');
  const { DatabasePipelineService } = require('./dist/ai/database-pipeline.service');

  const llmService = new AiLlmService(prisma);
  const dbPipelineService = new DatabasePipelineService(prisma, llmService);

  console.log('--- TEST RUN 1: How many employees do we have? ---');
  const res1 = await dbPipelineService.runDatabaseRetrievalPipeline(
    'How many employees do we have?',
    org.id,
    user.id,
    user.role
  );
  
  console.log('\n--- Telemetry Output ---');
  console.log(JSON.stringify({
    rawLlmResponse: res1.rawLlmResponse,
    parseError: res1.parseError,
    generatedPlan: res1.generatedPlan,
    validationResult: res1.validationResult,
    rowsCount: res1.rows.length,
    confidenceScore: res1.confidenceScore
  }, null, 2));

  console.log('\n--- TEST RUN 2: How many properties do we have? ---');
  const res2 = await dbPipelineService.runDatabaseRetrievalPipeline(
    'How many properties do we have?',
    org.id,
    user.id,
    user.role
  );

  console.log('\n--- Telemetry Output ---');
  console.log(JSON.stringify({
    rawLlmResponse: res2.rawLlmResponse,
    parseError: res2.parseError,
    generatedPlan: res2.generatedPlan,
    validationResult: res2.validationResult,
    rowsCount: res2.rows.length,
    confidenceScore: res2.confidenceScore
  }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

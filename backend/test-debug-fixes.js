const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { AiService } = require('./dist/ai/ai.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🏁 Starting NestJS Application Context for V9 Debug Verification...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const aiService = app.get(AiService);

  const org = await prisma.organization.findFirst();
  const user = await prisma.user.findFirst();
  if (!org || !user) {
    console.error('❌ Organization or User missing.');
    process.exit(1);
  }

  console.log(`👤 Resolved Identity: User=${user.firstName}, Role=${user.role}`);

  // Test 1: How many employees do we have?
  console.log('\n=========================================');
  console.log('TEST 1: "How many employees do we have?" (DATABASE_ONLY)');
  console.log('=========================================');
  const chat1 = await aiService.chat(
    'How many employees do we have?',
    user.id,
    org.id,
    user.role,
    null,
    true // debug mode enabled
  );
  console.log('Chat Response:', chat1.response);
  console.log('Citations count:', chat1.citations.length);

  // Test 2: How many properties do we have?
  console.log('\n=========================================');
  console.log('TEST 2: "How many properties do we have?" (DATABASE_ONLY)');
  console.log('=========================================');
  const chat2 = await aiService.chat(
    'How many properties do we have?',
    user.id,
    org.id,
    user.role,
    null,
    true
  );
  console.log('Chat Response:', chat2.response);
  console.log('Citations count:', chat2.citations.length);

  // Test 3: Database-only query cross validation skip check
  console.log('\n=========================================');
  console.log('TEST 3: Cross Validation Gating Check');
  console.log('=========================================');
  console.log('Verifying skip logic. Look above at [Cross Validation Telemetry] output in logs.');

  // Test 4: Simple lookup query
  console.log('\n=========================================');
  console.log('TEST 4: "show properties in Dubai Marina" (DATABASE_ONLY)');
  console.log('=========================================');
  const chat4 = await aiService.chat(
    'show properties in Dubai Marina',
    user.id,
    org.id,
    user.role,
    null,
    true
  );
  console.log('Chat Response:', chat4.response);
  console.log('Citations count:', chat4.citations.length);

  console.log('\n🎉 Verification Tests Complete!');
  await app.close();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

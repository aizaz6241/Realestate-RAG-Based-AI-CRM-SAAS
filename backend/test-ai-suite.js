const { NestFactory } = require('@nestjs/core');
const path = require('path');
const fs = require('fs');

// Path to compiled AppModule
const appModulePath = path.join(__dirname, 'dist', 'app.module.js');
const questionsPath = path.join('C:', 'Users', 'aizaz', '.gemini', 'antigravity', 'brain', 'c9323bed-bce6-41a4-854f-c99662aab8a8', 'zorvex_1000_test_questions.json');
const outputPath = path.join('C:', 'Users', 'aizaz', '.gemini', 'antigravity', 'brain', 'c9323bed-bce6-41a4-854f-c99662aab8a8', 'zorvex_test_results.json');

async function main() {
  console.log("Loading NestJS application context...");
  
  if (!fs.existsSync(appModulePath)) {
    console.error(`Compiled AppModule not found at: ${appModulePath}. Please run 'npm run build' first.`);
    process.exit(1);
  }

  const { AppModule } = require(appModulePath);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  
  // Resolve services
  const { PrismaService } = require(path.join(__dirname, 'dist', 'prisma', 'prisma.service.js'));
  const { AiService } = require(path.join(__dirname, 'dist', 'ai', 'ai.service.js'));
  
  const prisma = app.get(PrismaService);
  const aiService = app.get(AiService);

  console.log("Prisma and AiService resolved successfully.");

  // Fetch a user for each role to simulate appropriate security contexts
  const users = await prisma.user.findMany();
  const roleUserMap = {};
  
  // Map standard Roles to DB users. Note: DB uses uppercase Roles (SUPER_ADMIN, AGENT, HR, etc.)
  // Test questions use PascalCase Roles ('Admin', 'HR', 'Finance', 'Sales Manager', 'Agent', 'Logistics', 'Receptionist', 'Viewer')
  const roleMapping = {
    'Admin': 'SUPER_ADMIN',
    'HR': 'HR',
    'Finance': 'FINANCE',
    'Sales Manager': 'SALES_MANAGER',
    'Agent': 'AGENT',
    'Logistics': 'LOGISTICS',
    'Receptionist': 'RECEPTIONIST',
    'Viewer': 'VIEWER'
  };

  for (const user of users) {
    roleUserMap[user.role] = user;
  }

  console.log("Mapped roles to users:", Object.keys(roleUserMap));

  if (!fs.existsSync(questionsPath)) {
    console.error(`Questions file not found at: ${questionsPath}`);
    process.exit(1);
  }

  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  console.log(`Loaded ${questions.length} questions.`);

  // Parse command line arguments
  // Usage: node test-ai-suite.js --limit 30 --role Admin
  const limitArgIdx = process.argv.indexOf('--limit');
  let limit = limitArgIdx !== -1 ? parseInt(process.argv[limitArgIdx + 1], 10) : 30;
  
  const allArg = process.argv.includes('--all');
  if (allArg) {
    limit = questions.length;
  }

  const roleArgIdx = process.argv.indexOf('--role');
  const filterRole = roleArgIdx !== -1 ? process.argv[roleArgIdx + 1] : null;

  let testQueue = questions;
  if (filterRole) {
    testQueue = testQueue.filter(q => q.role.toLowerCase() === filterRole.toLowerCase());
  }

  // Slice to limit
  testQueue = testQueue.slice(0, limit);
  console.log(`Running test suite for ${testQueue.length} questions...`);

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < testQueue.length; i++) {
    const q = testQueue[i];
    const targetDbRole = roleMapping[q.role] || 'VIEWER';
    
    // Find simulated user
    // Fallback to first user in database if role doesn't exist
    const simUser = roleUserMap[targetDbRole] || users[0];
    
    if (!simUser) {
      console.error(`No user found in database to simulate role ${q.role}. Skipping...`);
      continue;
    }

    console.log(`\n[${i+1}/${testQueue.length}] Testing Role: ${q.role} | Category: ${q.category} | Lang: ${q.language}`);
    console.log(`Question: "${q.question}"`);
    console.log(`Simulated User: ${simUser.firstName} (${simUser.email}) [Role: ${simUser.role}]`);

    const startTime = Date.now();
    try {
      const chatResponse = await aiService.chat(
        q.question,
        simUser.id,
        simUser.organizationId,
        simUser.role,
        [] // Empty conversation history for clean isolated tests
      );
      
      const duration = Date.now() - startTime;
      console.log(`Status: Success (${duration}ms)`);
      console.log(`Response: ${chatResponse.response.substring(0, 150)}...`);
      if (chatResponse.toolExecuted) {
        console.log(`Tool Executed: ${chatResponse.toolExecuted}`);
      }

      results.push({
        id: q.id,
        role: q.role,
        category: q.category,
        language: q.language,
        question: q.question,
        simulatedUser: {
          id: simUser.id,
          email: simUser.email,
          role: simUser.role
        },
        response: chatResponse.response,
        toolExecuted: chatResponse.toolExecuted,
        toolData: chatResponse.toolData,
        citations: chatResponse.citations,
        duration,
        status: 'SUCCESS'
      });
      successCount++;
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`Status: Failed (${duration}ms) - ${err.message}`);
      results.push({
        id: q.id,
        role: q.role,
        category: q.category,
        language: q.language,
        question: q.question,
        error: err.message,
        duration,
        status: 'FAILED'
      });
      failureCount++;
    }

    // Add a small delay between queries to avoid API rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Save results
  fs.writeFileSync(outputPath, JSON.stringify(results, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2), 'utf8');

  console.log(`\n========================================`);
  console.log(`Test run completed!`);
  console.log(`Total Run: ${testQueue.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
  console.log(`Results saved at: ${outputPath}`);
  console.log(`========================================`);
  
  await app.close();
}

main().catch(console.error);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing pgvector extension creation...');
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector is supported and enabled!');
  } catch (err) {
    console.log('❌ pgvector is NOT supported:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

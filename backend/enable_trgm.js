const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Connecting to PostgreSQL database to enable pg_trgm...');
  try {
    // 1. Enable extension
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    console.log('✔ Extension pg_trgm successfully enabled!');

    // 2. Add trigram indexes to User model for fuzzy search
    console.log('🔄 Creating pg_trgm index on User.firstName and User.lastName...');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS user_name_trgm_idx ON "User" USING gin (("firstName" || \' \' || COALESCE("lastName", \'\')) gin_trgm_ops);');
    console.log('✔ Name trigram index successfully created!');
    
  } catch (error) {
    console.error('❌ Failed to apply database indices:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

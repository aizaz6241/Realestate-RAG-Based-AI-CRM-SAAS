import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("Testing: SELECT u FROM \"User\" u");
    const res1 = await prisma.$queryRawUnsafe('SELECT u FROM "User" u LIMIT 1');
    console.log("SELECT u result:", res1);
  } catch (err: any) {
    console.error("SELECT u failed:", err.message);
  }

  try {
    console.log("Testing: SELECT u.* FROM \"User\" u");
    const res2 = await prisma.$queryRawUnsafe('SELECT u.* FROM "User" u LIMIT 1');
    console.log("SELECT u.* result:", res2);
  } catch (err: any) {
    console.error("SELECT u.* failed:", err.message);
  }

  await prisma.$disconnect();
}

main();

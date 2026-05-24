import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

async function main() {
  const users = await prisma.user.findMany({
    include: { organization: true }
  });
  console.log("USERS IN DATABASE:", JSON.stringify(users, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

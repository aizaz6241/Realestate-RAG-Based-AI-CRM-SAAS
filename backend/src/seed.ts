import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

async function main() {
  console.log("Seeding database...");

  // 1. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: "RENS Ecosystem",
      domain: "rens.com"
    }
  });
  console.log("Created Organization:", org.name);

  // 2. Hash Password
  const passwordHash = await bcrypt.hash("admin123", 10);

  // 3. Create Admin User
  const admin = await prisma.user.create({
    data: {
      email: "admin@rens.com",
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      role: "SUPER_ADMIN",
      organizationId: org.id
    }
  });
  console.log("Created Admin User:", admin.email);

  // 4. Create Employee Profile for Admin
  const profile = await prisma.employeeProfile.create({
    data: {
      userId: admin.id,
      department: "Administration",
      designation: "Executive Director",
      status: "ACTIVE",
      organizationId: org.id
    }
  });
  console.log("Created Employee Profile for Admin.");

  console.log("Seeding completed successfully!");
}

main()
  .catch(e => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

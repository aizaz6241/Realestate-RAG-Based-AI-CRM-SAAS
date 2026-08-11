const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.update({
    where: { email: 'admin@zorvex.com' },
    data: { passwordHash: hashedPassword }
  });
  console.log('Password reset successfully for admin@zorvex.com to admin123');
}

main().catch(console.error).finally(() => prisma.$disconnect());

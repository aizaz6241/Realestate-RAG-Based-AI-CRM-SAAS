const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Checking users...");
  const users = await prisma.user.findMany({
    select: { id: true, firstName: true, email: true, role: true }
  });
  console.log("Users in DB:", users);

  console.log("Checking employee profiles...");
  const profiles = await prisma.employeeProfile.findMany({
    include: {
      user: { select: { firstName: true, email: true } }
    }
  });
  console.log("Profiles in DB:", profiles.map(p => ({ id: p.id, email: p.user.email, designation: p.designation })));

  console.log("Checking attendance records count...");
  const attendanceCount = await prisma.attendance.count();
  console.log("Total attendance records:", attendanceCount);

  if (attendanceCount > 0) {
    const sample = await prisma.attendance.findFirst({
      include: {
        employeeProfile: {
          include: {
            user: { select: { firstName: true } }
          }
        }
      }
    });
    console.log("Sample attendance:", {
      id: sample.id,
      dateStr: sample.dateStr,
      status: sample.status,
      employeeName: sample.employeeProfile.user.firstName
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

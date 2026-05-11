/**
 * Cleanup script: deletes all data except the demo user account.
 * Run via: node apps/backend/prisma/cleanup.js
 * Or as a Render One-Off Job: node dist/src/main.js (or this script directly)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const demoEmail = process.env.SEED_DEMO_EMAIL;

  if (!demoEmail) {
    console.log('SEED_DEMO_EMAIL not set — skipping cleanup to avoid accidental wipe.');
    return;
  }

  const demoUser = await prisma.user.findUnique({ where: { email: demoEmail } });

  // Delete request logs and analytics (high-volume tables first)
  const deletedLogs = await prisma.requestLog.deleteMany({});
  console.log(`Deleted ${deletedLogs.count} request logs`);

  const deletedSnapshots = await prisma.analyticsSnapshot.deleteMany({});
  console.log(`Deleted ${deletedSnapshots.count} analytics snapshots`);

  const deletedAudit = await prisma.auditLog.deleteMany({});
  console.log(`Deleted ${deletedAudit.count} audit logs`);

  if (demoUser) {
    // Delete projects NOT owned by the demo user (preserves demo project if any)
    const nonDemoProjects = await prisma.project.findMany({
      where: { ownerId: { not: demoUser.id } },
      select: { id: true },
    });
    if (nonDemoProjects.length > 0) {
      await prisma.project.deleteMany({
        where: { id: { in: nonDemoProjects.map(p => p.id) } },
      });
      console.log(`Deleted ${nonDemoProjects.length} non-demo projects`);
    }

    // Delete users that are not the demo user
    const deleted = await prisma.user.deleteMany({
      where: { id: { not: demoUser.id } },
    });
    console.log(`Deleted ${deleted.count} non-demo users`);
    console.log(`Demo user preserved: ${demoEmail}`);
  } else {
    // No demo user — just delete all non-essential data but keep users
    const deleted = await prisma.project.deleteMany({});
    console.log(`Deleted ${deleted.count} projects (no demo user found)`);
  }

  console.log('Cleanup complete.');
}

main()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

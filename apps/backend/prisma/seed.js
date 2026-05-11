require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { PrismaClient, UserTier } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_DEMO_EMAIL;
  const password = process.env.SEED_DEMO_PASSWORD;

  if (!email || !password) {
    console.log('Seed skipped: SEED_DEMO_EMAIL and SEED_DEMO_PASSWORD not set.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const fullName = process.env.SEED_DEMO_FULL_NAME || 'Guest Demo';

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, fullName },
    create: {
      email,
      passwordHash,
      fullName,
      tier: UserTier.FREE,
      isActive: true,
    },
  });

  console.log(`Demo user upserted: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

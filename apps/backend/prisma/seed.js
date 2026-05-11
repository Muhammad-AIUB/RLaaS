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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Demo user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: 'Guest Demo',
      tier: UserTier.FREE,
      isActive: true,
    },
  });

  console.log(`Demo user created: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

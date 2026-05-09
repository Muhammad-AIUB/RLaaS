require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log(
    'Seed skipped: no mock or demo data is created for this project.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

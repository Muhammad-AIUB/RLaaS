require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const {
  PrismaClient,
  UserTier,
  ProjectRole,
  RuleAlgorithm,
  RuleScope,
  HttpMethod,
  RequestDecision,
} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { createHmac } = require('crypto');

const prisma = new PrismaClient();

// Matches what toSlug() would produce for 'Demo API Project'.
const DEMO_PROJECT_SLUG = 'demo-api-project';

function hashApiKey(value) {
  // Same resolution as ApiKeysService, and the same refusal to invent a pepper:
  // seeding with 'change-me' wrote a hash the running API could never match.
  const pepper = process.env.API_KEY_HASH_PEPPER || process.env.JWT_SECRET;

  if (!pepper) {
    throw new Error(
      'Cannot hash the demo API key: set API_KEY_HASH_PEPPER (or JWT_SECRET).',
    );
  }

  return createHmac('sha256', pepper).update(value).digest('hex');
}

async function main() {
  const email = process.env.SEED_DEMO_EMAIL;
  const password = process.env.SEED_DEMO_PASSWORD;

  if (!email || !password) {
    console.log('Seed skipped: SEED_DEMO_EMAIL and SEED_DEMO_PASSWORD not set.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 8);
  const fullName = process.env.SEED_DEMO_FULL_NAME || 'Guest Demo';

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, fullName },
    create: { email, passwordHash, fullName, tier: UserTier.FREE, isActive: true },
  });
  console.log(`Demo user upserted: ${email}`);

  // Upsert demo project.
  //
  // `ownerId` and `slug` are both required by the schema (slug is @unique), and
  // neither was supplied here: on an empty database this create threw, the seed
  // exited non-zero, and because the Render start command is
  // `migrate deploy && db seed && node dist/main`, the API never booted at all.
  // Provisioning a fresh database was impossible.
  let project = await prisma.project.findFirst({
    where: { name: 'Demo API Project', members: { some: { userId: user.id } } },
  });
  if (!project) {
    // Upsert on the unique column rather than create, so a re-run against a
    // database that already holds the slug adopts that row instead of throwing.
    project = await prisma.project.upsert({
      where: { slug: DEMO_PROJECT_SLUG },
      update: {},
      create: {
        ownerId: user.id,
        name: 'Demo API Project',
        slug: DEMO_PROJECT_SLUG,
        description: 'A sample project showing rate limiting in action.',
        members: { create: { userId: user.id, role: ProjectRole.OWNER } },
      },
    });
    console.log(`Demo project created: ${project.id}`);
  }

  // Upsert rate limit rules
  const existingRules = await prisma.rateLimitRule.count({ where: { projectId: project.id } });
  if (existingRules === 0) {
    await prisma.rateLimitRule.createMany({
      data: [
        {
          projectId: project.id,
          name: 'Global API Limit',
          scope: RuleScope.GLOBAL,
          algorithm: RuleAlgorithm.SLIDING_WINDOW_COUNTER,
          limit: 1000,
          windowSeconds: 60,
          isActive: true,
          priority: 1,
        },
        {
          projectId: project.id,
          name: 'Auth Endpoint Guard',
          scope: RuleScope.ENDPOINT,
          algorithm: RuleAlgorithm.FIXED_WINDOW,
          endpointPattern: '/api/auth/*',
          method: HttpMethod.POST,
          limit: 10,
          windowSeconds: 60,
          isActive: true,
          priority: 2,
        },
        {
          projectId: project.id,
          name: 'Free Tier User Cap',
          scope: RuleScope.USER_TIER,
          algorithm: RuleAlgorithm.TOKEN_BUCKET,
          userTier: UserTier.FREE,
          limit: 100,
          windowSeconds: 3600,
          isActive: true,
          priority: 3,
        },
        {
          projectId: project.id,
          name: 'IP-based DDoS Shield',
          scope: RuleScope.IP,
          algorithm: RuleAlgorithm.FIXED_WINDOW,
          limit: 200,
          windowSeconds: 10,
          isActive: false,
          priority: 4,
        },
      ],
    });
    console.log('Demo rules created');
  }

  // Upsert demo API key.
  //
  // Only when SEED_RAW_API_KEY is set. The previous fallback minted a random key
  // whose plaintext was printed nowhere, so every deploy left one more unusable
  // API key row behind. Now that the value is no longer committed in
  // render.yaml, that fallback would have run on every single deploy.
  const rawKey = process.env.SEED_RAW_API_KEY;

  if (rawKey) {
    const keyPrefix = rawKey.slice(0, 18);
    const hashedKey = hashApiKey(rawKey);

    await prisma.apiKey.upsert({
      where: { hashedKey },
      update: {},
      create: {
        projectId: project.id,
        name: 'Demo Key',
        keyPrefix,
        hashedKey,
        hashVersion: 'hmac-sha256-v1',
        expiresAt: null,
      },
    });
    console.log(`Demo API key upserted: ${keyPrefix}...`);
  } else {
    console.log('Demo API key skipped: SEED_RAW_API_KEY not set.');
  }

  // Seed a small batch of realistic request logs (skip if already present)
  const logCount = await prisma.requestLog.count({ where: { projectId: project.id } });
  if (logCount === 0) {
    const now = Date.now();
    const logs = [];
    const endpoints = ['/api/users', '/api/products', '/api/orders', '/api/auth/login', '/api/search'];
    const methods = [HttpMethod.GET, HttpMethod.POST, HttpMethod.GET, HttpMethod.GET, HttpMethod.GET];
    for (let i = 0; i < 120; i++) {
      const blocked = i % 7 === 0;
      const ts = new Date(now - (120 - i) * 30_000);
      logs.push({
        projectId: project.id,
        apiKeyId: null,
        ipAddress: `10.0.${Math.floor(i / 25)}.${(i % 25) + 1}`,
        endpoint: endpoints[i % endpoints.length],
        method: methods[i % methods.length],
        decision: blocked ? RequestDecision.BLOCKED : RequestDecision.ALLOWED,
        algorithm: RuleAlgorithm.SLIDING_WINDOW_COUNTER,
        limit: 1000,
        remaining: blocked ? 0 : 1000 - (i % 50),
        responseTimeMs: blocked ? null : 20 + Math.floor(Math.random() * 80),
        createdAt: ts,
        metadata: {},
      });
    }
    await prisma.requestLog.createMany({ data: logs });
    console.log('Demo request logs created');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

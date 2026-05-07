require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const {
  PrismaClient,
  UserTier,
  ApiKeyStatus,
  RuleAlgorithm,
  RuleScope,
  RequestDecision,
  HttpMethod,
  SnapshotWindow,
  Prisma,
  ProjectRole,
} = require('@prisma/client');
const { hashSync } = require('bcryptjs');
const { createHmac } = require('crypto');

const prisma = new PrismaClient();

function hashApiKey(value) {
  const pepper = process.env.API_KEY_HASH_PEPPER || process.env.JWT_SECRET || 'change-me';
  return createHmac('sha256', pepper).update(value).digest('hex');
}

function subtractMinutes(date, minutes) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

async function main() {
  const demoEmail = process.env.SEED_DEMO_EMAIL || 'demo@rlaas.local';
  const demoPassword = process.env.SEED_DEMO_PASSWORD || 'DemoPass123!';
  const demoFullName = process.env.SEED_DEMO_FULL_NAME || 'RLaaS Demo User';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@rlaas.local';
  const viewerEmail = process.env.SEED_VIEWER_EMAIL || 'viewer@rlaas.local';
  const rawApiKey =
    process.env.SEED_RAW_API_KEY || 'rlaas_live_demo_seed_key_1234567890';
  const hashedApiKey = hashApiKey(rawApiKey);
  const keyPrefix = rawApiKey.slice(0, 18);
  const projectSlug = 'demo-storefront-api';
  const now = new Date();

  const user = await prisma.user.upsert({
    where: { email: demoEmail.toLowerCase() },
    update: {
      fullName: demoFullName,
      passwordHash: hashSync(demoPassword, 12),
      tier: UserTier.PRO,
      isActive: true,
    },
    create: {
      email: demoEmail.toLowerCase(),
      passwordHash: hashSync(demoPassword, 12),
      fullName: demoFullName,
      tier: UserTier.PRO,
      isActive: true,
    },
  });

  const [adminUser, viewerUser] = await Promise.all([
    prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {
        fullName: 'RLaaS Demo Admin',
        passwordHash: hashSync('AdminPass123!', 12),
        tier: UserTier.BUSINESS,
        isActive: true,
      },
      create: {
        email: adminEmail.toLowerCase(),
        fullName: 'RLaaS Demo Admin',
        passwordHash: hashSync('AdminPass123!', 12),
        tier: UserTier.BUSINESS,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: viewerEmail.toLowerCase() },
      update: {
        fullName: 'RLaaS Demo Viewer',
        passwordHash: hashSync('ViewerPass123!', 12),
        tier: UserTier.FREE,
        isActive: true,
      },
      create: {
        email: viewerEmail.toLowerCase(),
        fullName: 'RLaaS Demo Viewer',
        passwordHash: hashSync('ViewerPass123!', 12),
        tier: UserTier.FREE,
        isActive: true,
      },
    }),
  ]);

  const project = await prisma.project.upsert({
    where: { slug: projectSlug },
    update: {
      ownerId: user.id,
      name: 'Demo Storefront API',
      description: 'Seeded project used to explore the RLaaS dashboard and gateway.',
      environment: 'production',
      isActive: true,
    },
    create: {
      ownerId: user.id,
      name: 'Demo Storefront API',
      slug: projectSlug,
      description: 'Seeded project used to explore the RLaaS dashboard and gateway.',
      environment: 'production',
      isActive: true,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: user.id,
      },
    },
    update: { role: ProjectRole.OWNER },
    create: {
      projectId: project.id,
      userId: user.id,
      role: ProjectRole.OWNER,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: adminUser.id,
      },
    },
    update: { role: ProjectRole.ADMIN },
    create: {
      projectId: project.id,
      userId: adminUser.id,
      role: ProjectRole.ADMIN,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: viewerUser.id,
      },
    },
    update: { role: ProjectRole.VIEWER },
    create: {
      projectId: project.id,
      userId: viewerUser.id,
      role: ProjectRole.VIEWER,
    },
  });

  await prisma.$transaction([
    prisma.requestLog.deleteMany({ where: { projectId: project.id } }),
    prisma.analyticsSnapshot.deleteMany({ where: { projectId: project.id } }),
    prisma.rateLimitRule.deleteMany({ where: { projectId: project.id } }),
    prisma.apiKey.deleteMany({ where: { projectId: project.id } }),
  ]);

  const apiKey = await prisma.apiKey.create({
    data: {
      projectId: project.id,
      name: 'Demo production key',
      keyPrefix,
      hashedKey: hashedApiKey,
      hashVersion: 'hmac-sha256-v1',
      status: ApiKeyStatus.ACTIVE,
      lastUsedAt: now,
    },
  });

  const rules = await prisma.$transaction([
    prisma.rateLimitRule.create({
      data: {
        projectId: project.id,
        name: 'Known scraper IP rule',
        description: 'Aggressive protection for a known scraping IP.',
        priority: 10,
        scope: RuleScope.IP,
        targetValue: '203.0.113.10',
        method: HttpMethod.GET,
        algorithm: RuleAlgorithm.TOKEN_BUCKET,
        limit: 5,
        windowSeconds: 60,
        burstCapacity: 5,
      },
    }),
    prisma.rateLimitRule.create({
      data: {
        projectId: project.id,
        name: 'API key baseline rule',
        description: 'Key-specific steady-state protection.',
        priority: 20,
        scope: RuleScope.API_KEY,
        targetValue: apiKey.id,
        method: HttpMethod.GET,
        algorithm: RuleAlgorithm.SLIDING_WINDOW_COUNTER,
        limit: 100,
        windowSeconds: 60,
        burstCapacity: 120,
      },
    }),
    prisma.rateLimitRule.create({
      data: {
        projectId: project.id,
        name: 'Free tier catalog rule',
        description: 'Tighter browsing limits for free-tier product browsing.',
        priority: 30,
        scope: RuleScope.USER_TIER,
        userTier: UserTier.FREE,
        method: HttpMethod.GET,
        algorithm: RuleAlgorithm.SLIDING_WINDOW_LOG,
        limit: 30,
        windowSeconds: 60,
      },
    }),
    prisma.rateLimitRule.create({
      data: {
        projectId: project.id,
        name: 'Checkout endpoint rule',
        description: 'Protect checkout paths from bursts and abuse.',
        priority: 40,
        scope: RuleScope.ENDPOINT,
        endpointPattern: '/api/checkout*',
        method: HttpMethod.POST,
        algorithm: RuleAlgorithm.FIXED_WINDOW,
        limit: 20,
        windowSeconds: 60,
      },
    }),
    prisma.rateLimitRule.create({
      data: {
        projectId: project.id,
        name: 'Global fallback rule',
        description: 'Safe default project-wide protection.',
        priority: 999,
        scope: RuleScope.GLOBAL,
        algorithm: RuleAlgorithm.FIXED_WINDOW,
        limit: 250,
        windowSeconds: 60,
      },
    }),
  ]);

  const seededLogs = [
    {
      ipAddress: '203.0.113.10',
      endpoint: '/api/products',
      method: HttpMethod.GET,
      userTier: UserTier.FREE,
      decision: RequestDecision.BLOCKED,
      reason: 'RATE_LIMIT_EXCEEDED',
      algorithm: RuleAlgorithm.TOKEN_BUCKET,
      limit: 5,
      remaining: 0,
      retryAfter: 12,
      responseTimeMs: 21,
      createdAt: subtractMinutes(now, 4),
      ruleId: rules[0].id,
    },
    {
      ipAddress: '203.0.113.10',
      endpoint: '/api/products',
      method: HttpMethod.GET,
      userTier: UserTier.FREE,
      decision: RequestDecision.BLOCKED,
      reason: 'RATE_LIMIT_EXCEEDED',
      algorithm: RuleAlgorithm.TOKEN_BUCKET,
      limit: 5,
      remaining: 0,
      retryAfter: 8,
      responseTimeMs: 19,
      createdAt: subtractMinutes(now, 3),
      ruleId: rules[0].id,
    },
    {
      ipAddress: '198.51.100.24',
      endpoint: '/api/products',
      method: HttpMethod.GET,
      userTier: UserTier.FREE,
      decision: RequestDecision.ALLOWED,
      reason: null,
      algorithm: RuleAlgorithm.SLIDING_WINDOW_LOG,
      limit: 30,
      remaining: 12,
      retryAfter: 0,
      responseTimeMs: 14,
      createdAt: subtractMinutes(now, 15),
      ruleId: rules[2].id,
    },
    {
      ipAddress: '198.51.100.25',
      endpoint: '/api/products',
      method: HttpMethod.GET,
      userTier: UserTier.FREE,
      decision: RequestDecision.ALLOWED,
      reason: null,
      algorithm: RuleAlgorithm.SLIDING_WINDOW_LOG,
      limit: 30,
      remaining: 11,
      retryAfter: 0,
      responseTimeMs: 12,
      createdAt: subtractMinutes(now, 14),
      ruleId: rules[2].id,
    },
    {
      ipAddress: '198.51.100.42',
      endpoint: '/api/checkout',
      method: HttpMethod.POST,
      userTier: UserTier.PRO,
      decision: RequestDecision.ALLOWED,
      reason: null,
      algorithm: RuleAlgorithm.FIXED_WINDOW,
      limit: 20,
      remaining: 7,
      retryAfter: 0,
      responseTimeMs: 28,
      createdAt: subtractMinutes(now, 10),
      ruleId: rules[3].id,
    },
    {
      ipAddress: '198.51.100.42',
      endpoint: '/api/checkout',
      method: HttpMethod.POST,
      userTier: UserTier.PRO,
      decision: RequestDecision.BLOCKED,
      reason: 'RATE_LIMIT_EXCEEDED',
      algorithm: RuleAlgorithm.FIXED_WINDOW,
      limit: 20,
      remaining: 0,
      retryAfter: 17,
      responseTimeMs: 33,
      createdAt: subtractMinutes(now, 9),
      ruleId: rules[3].id,
    },
    {
      ipAddress: '192.0.2.80',
      endpoint: '/api/search',
      method: HttpMethod.GET,
      userTier: UserTier.PRO,
      decision: RequestDecision.ALLOWED,
      reason: null,
      algorithm: RuleAlgorithm.SLIDING_WINDOW_COUNTER,
      limit: 100,
      remaining: 73,
      retryAfter: 0,
      responseTimeMs: 11,
      createdAt: subtractMinutes(now, 7),
      ruleId: rules[1].id,
    },
    {
      ipAddress: '192.0.2.81',
      endpoint: '/api/search',
      method: HttpMethod.GET,
      userTier: UserTier.PRO,
      decision: RequestDecision.ALLOWED,
      reason: null,
      algorithm: RuleAlgorithm.SLIDING_WINDOW_COUNTER,
      limit: 100,
      remaining: 68,
      retryAfter: 0,
      responseTimeMs: 9,
      createdAt: subtractMinutes(now, 6),
      ruleId: rules[1].id,
    },
    {
      ipAddress: '192.0.2.82',
      endpoint: '/api/orders',
      method: HttpMethod.GET,
      userTier: UserTier.PRO,
      decision: RequestDecision.ALLOWED,
      reason: null,
      algorithm: RuleAlgorithm.FIXED_WINDOW,
      limit: 250,
      remaining: 190,
      retryAfter: 0,
      responseTimeMs: 8,
      createdAt: subtractMinutes(now, 5),
      ruleId: rules[4].id,
    },
    {
      ipAddress: '192.0.2.90',
      endpoint: '/api/products',
      method: HttpMethod.GET,
      userTier: UserTier.FREE,
      decision: RequestDecision.ALLOWED,
      reason: null,
      algorithm: RuleAlgorithm.SLIDING_WINDOW_LOG,
      limit: 30,
      remaining: 15,
      retryAfter: 0,
      responseTimeMs: 10,
      createdAt: subtractMinutes(now, 2),
      ruleId: rules[2].id,
    },
  ];

  await prisma.requestLog.createMany({
    data: seededLogs.map((log) => ({
      projectId: project.id,
      apiKeyId: apiKey.id,
      ruleId: log.ruleId,
      ipAddress: log.ipAddress,
      endpoint: log.endpoint,
      method: log.method,
      userTier: log.userTier,
      decision: log.decision,
      reason: log.reason,
      algorithm: log.algorithm,
      limit: log.limit,
      remaining: log.remaining,
      retryAfter: log.retryAfter,
      responseTimeMs: log.responseTimeMs,
      createdAt: log.createdAt,
      metadata: {
        seeded: true,
      },
    })),
  });

  const totalRequests = seededLogs.length;
  const blockedRequests = seededLogs.filter(
    (entry) => entry.decision === RequestDecision.BLOCKED,
  ).length;
  const allowedRequests = totalRequests - blockedRequests;
  const blockRate = totalRequests === 0 ? 0 : (blockedRequests / totalRequests) * 100;

  const topOffendingIps = Object.entries(
    seededLogs.reduce((accumulator, entry) => {
      accumulator[entry.ipAddress] = (accumulator[entry.ipAddress] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([ip, requests]) => ({ ip, requests }));

  const mostUsedEndpoints = Object.entries(
    seededLogs.reduce((accumulator, entry) => {
      const key = `${entry.method}:${entry.endpoint}`;
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([value, requests]) => {
      const parts = value.split(':');
      return {
        method: parts[0],
        endpoint: parts.slice(1).join(':'),
        requests,
      };
    });

  const algorithmPerformanceComparison = Object.entries(
    seededLogs.reduce((accumulator, entry) => {
      const key = entry.algorithm;
      if (!accumulator[key]) {
        accumulator[key] = {
          algorithm: key,
          requests: 0,
          retryAfterSum: 0,
          responseTimeSum: 0,
        };
      }

      accumulator[key].requests += 1;
      accumulator[key].retryAfterSum += entry.retryAfter;
      accumulator[key].responseTimeSum += entry.responseTimeMs || 0;

      return accumulator;
    }, {}),
  ).map(([, value]) => ({
    algorithm: value.algorithm,
    requests: value.requests,
    averageRetryAfter: Number((value.retryAfterSum / value.requests).toFixed(2)),
    averageResponseTimeMs: Number(
      (value.responseTimeSum / value.requests).toFixed(2),
    ),
  }));

  await prisma.analyticsSnapshot.create({
    data: {
      projectId: project.id,
      window: SnapshotWindow.DAILY,
      periodStart: subtractMinutes(now, 60 * 24),
      periodEnd: now,
      totalRequests,
      allowedRequests,
      blockedRequests,
      blockRate: new Prisma.Decimal(blockRate.toFixed(2)),
      topOffendingIps,
      mostUsedEndpoints,
      algorithmPerformanceComparison,
    },
  });

  console.log('Seed complete');
  console.log(`Demo email: ${demoEmail}`);
  console.log(`Demo password: ${demoPassword}`);
  console.log(`Admin email: ${adminEmail}`);
  console.log('Admin password: AdminPass123!');
  console.log(`Viewer email: ${viewerEmail}`);
  console.log('Viewer password: ViewerPass123!');
  console.log(`Demo project slug: ${project.slug}`);
  console.log(`Demo raw API key: ${rawApiKey}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

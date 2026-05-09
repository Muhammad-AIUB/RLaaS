const { performance } = require('node:perf_hooks');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const prisma = new PrismaClient();

const iterations = Number(process.env.DB_LATENCY_ITERATIONS ?? 5);

function toJson(value) {
  return JSON.stringify(
    value,
    (_, nestedValue) =>
      typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
    2,
  );
}

function getDatabaseHost() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return 'DATABASE_URL is not set';
  }

  try {
    const url = new URL(databaseUrl);
    return url.host;
  } catch {
    return 'DATABASE_URL is not a valid URL';
  }
}

async function measure(label, fn, count = iterations) {
  const samples = [];

  for (let i = 0; i < count; i += 1) {
    const startedAt = performance.now();
    await fn();
    samples.push(performance.now() - startedAt);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((total, sample) => total + sample, 0);
  const average = sum / samples.length;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return {
    label,
    samplesMs: samples.map((sample) => Number(sample.toFixed(2))),
    minMs: Number(sorted[0].toFixed(2)),
    avgMs: Number(average.toFixed(2)),
    p95Ms: Number(sorted[p95Index].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

async function resolveProjectAndUser() {
  if (process.env.PROJECT_ID && process.env.USER_ID) {
    return {
      projectId: process.env.PROJECT_ID,
      userId: process.env.USER_ID,
      source: 'PROJECT_ID and USER_ID env vars',
    };
  }

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      pm.project_id::text AS "projectId",
      pm.user_id::text AS "userId",
      COUNT(rl.id)::bigint AS "requestLogCount"
    FROM project_members pm
    LEFT JOIN request_logs rl ON rl.project_id = pm.project_id
    GROUP BY pm.project_id, pm.user_id
    ORDER BY COUNT(rl.id) DESC
    LIMIT 1
  `);

  if (rows.length === 0) {
    throw new Error(
      'No project_members rows found. Set PROJECT_ID and USER_ID to measure specific lookups.',
    );
  }

  return {
    projectId: rows[0].projectId,
    userId: rows[0].userId,
    requestLogCount: rows[0].requestLogCount,
    source: 'busiest accessible project from local database',
  };
}

async function main() {
  console.log(`Database host: ${getDatabaseHost()}`);
  console.log(`PRISMA_QUERY_DEBUG: ${process.env.PRISMA_QUERY_DEBUG ?? 'unset'}`);
  console.log(`Iterations per measurement: ${iterations}`);

  const connectStartedAt = performance.now();
  await prisma.$connect();
  const connectMs = performance.now() - connectStartedAt;
  console.log(`Prisma connectMs: ${connectMs.toFixed(2)}`);

  const context = await resolveProjectAndUser();
  console.log(
    `Measurement context: source="${context.source}" projectId=${context.projectId} userId=${context.userId}` +
      (context.requestLogCount === undefined
        ? ''
        : ` requestLogCount=${context.requestLogCount}`),
  );

  const results = [];

  results.push(
    await measure('SELECT 1 via Prisma raw', () => prisma.$queryRaw`SELECT 1`),
  );

  results.push(
    await measure('project_members lookup via Prisma model', () =>
      prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: context.projectId,
            userId: context.userId,
          },
        },
        select: {
          role: true,
        },
      }),
    ),
  );

  results.push(
    await measure('project_members lookup via raw SQL', () =>
      prisma.$queryRaw`
        SELECT role
        FROM project_members
        WHERE project_id = ${context.projectId}::uuid
          AND user_id = ${context.userId}::uuid
        LIMIT 1
      `,
    ),
  );

  results.push(
    await measure('request_logs lookup via Prisma model', () =>
      prisma.requestLog.findMany({
        where: {
          projectId: context.projectId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: {
          id: true,
          projectId: true,
          apiKeyId: true,
          ruleId: true,
          requestId: true,
          idempotencyKey: true,
          ipAddress: true,
          endpoint: true,
          method: true,
          userTier: true,
          decision: true,
          reason: true,
          algorithm: true,
          limit: true,
          remaining: true,
          retryAfter: true,
          responseTimeMs: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ),
  );

  results.push(
    await measure('request_logs lookup via raw SQL', () =>
      prisma.$queryRaw`
        SELECT
          id,
          project_id,
          api_key_id,
          rule_id,
          request_id,
          idempotency_key,
          ip_address,
          endpoint,
          method,
          user_tier,
          decision,
          reason,
          algorithm,
          "limit",
          remaining,
          retry_after,
          response_time_ms,
          metadata,
          created_at
        FROM request_logs
        WHERE project_id = ${context.projectId}::uuid
        ORDER BY created_at DESC, id DESC
        LIMIT 8
      `,
    ),
  );

  console.log('\nLatency results:');
  for (const result of results) {
    console.log(toJson(result));
  }

  console.log('\nInterpretation:');
  console.log('- High SELECT 1 or connectMs means network/Neon cold start/connection setup is dominating.');
  console.log('- Fast raw SQL but slow Prisma model lookup points to Prisma client serialization/runtime overhead.');
  console.log('- Similar raw and model timings point away from app code and toward cloud DB/network latency.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

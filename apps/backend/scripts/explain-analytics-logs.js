const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');

dotenv.config();

const prisma = new PrismaClient();

function serialize(value) {
  return JSON.stringify(
    value,
    (_, nestedValue) =>
      typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
    2,
  );
}

function printRows(title, rows) {
  console.log(`\n--- ${title} ---`);
  if (rows.length === 0) {
    console.log('No rows.');
    return;
  }

  for (const row of rows) {
    const plan = row['QUERY PLAN'];
    console.log(typeof plan === 'string' ? plan : serialize(row));
  }
}

async function resolveProjectId() {
  if (process.env.PROJECT_ID) {
    return process.env.PROJECT_ID;
  }

  const rows = await prisma.$queryRawUnsafe(`
    SELECT project_id::text AS project_id, COUNT(*)::bigint AS request_count
    FROM request_logs
    GROUP BY project_id
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `);

  if (rows.length === 0) {
    throw new Error('No request_logs rows found. Set PROJECT_ID to inspect a specific project.');
  }

  console.log(
    `Using busiest project_id=${rows[0].project_id} request_count=${rows[0].request_count}`,
  );
  return rows[0].project_id;
}

async function main() {
  const projectId = await resolveProjectId();

  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'request_logs'
    ORDER BY indexname
  `);
  console.log('\n--- request_logs indexes ---');
  for (const index of indexes) {
    console.log(`${index.indexname}: ${index.indexdef}`);
  }

  const stats = await prisma.$queryRawUnsafe(`
    SELECT
      relname,
      n_live_tup,
      n_dead_tup,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze
    FROM pg_stat_user_tables
    WHERE relname IN ('request_logs', 'api_keys', 'rate_limit_rules')
    ORDER BY relname
  `);
  console.log('\n--- table stats ---');
  for (const row of stats) {
    console.log(serialize(row));
  }

  const requestLogsPlan = await prisma.$queryRawUnsafe(
    `
      EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
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
      WHERE project_id = $1::uuid
      ORDER BY created_at DESC, id DESC
      LIMIT 8
    `,
    projectId,
  );
  printRows('request_logs exact query plan', requestLogsPlan);

  const recentLogRelations = await prisma.$queryRawUnsafe(
    `
      SELECT api_key_id::text AS api_key_id, rule_id::text AS rule_id
      FROM request_logs
      WHERE project_id = $1::uuid
      ORDER BY created_at DESC, id DESC
      LIMIT 8
    `,
    projectId,
  );
  const apiKeyIds = [
    ...new Set(recentLogRelations.map((row) => row.api_key_id).filter(Boolean)),
  ];
  const ruleIds = [
    ...new Set(recentLogRelations.map((row) => row.rule_id).filter(Boolean)),
  ];

  if (apiKeyIds.length > 0) {
    const apiKeyPlan = await prisma.$queryRawUnsafe(
      `
        EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
        SELECT id, name, key_prefix, status
        FROM api_keys
        WHERE id = ANY($1::uuid[])
      `,
      apiKeyIds,
    );
    printRows('api_keys hydration plan', apiKeyPlan);
  } else {
    console.log('\n--- api_keys hydration plan ---');
    console.log('No api_key_id values in the latest 8 logs.');
  }

  if (ruleIds.length > 0) {
    const rulePlan = await prisma.$queryRawUnsafe(
      `
        EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
        SELECT id, name, scope, priority
        FROM rate_limit_rules
        WHERE id = ANY($1::uuid[])
      `,
      ruleIds,
    );
    printRows('rate_limit_rules hydration plan', rulePlan);
  } else {
    console.log('\n--- rate_limit_rules hydration plan ---');
    console.log('No rule_id values in the latest 8 logs.');
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

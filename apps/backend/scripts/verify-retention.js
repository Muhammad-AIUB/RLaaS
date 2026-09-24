/**
 * Post-rollout checks for request_logs retention (migrations 0004 + 0005 and
 * the RequestLogRetention job). Read-only: every query runs in a READ ONLY
 * transaction, and Redis is only read.
 *
 *   pnpm --filter @rlaas/backend retention:verify
 *
 * Prints PASS / WARN / FAIL per check and exits 1 if anything FAILs.
 * Uses DATABASE_URL / REDIS_URL from apps/backend/.env, i.e. production.
 */
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const RETENTION_DAYS = 35; // REQUEST_LOG_RETENTION_DAYS
const BRIN_INDEX = 'request_logs_created_at_brin_idx';
const LAST_RUN_KEY = 'rlaas:retention:request-logs:last-run';
const LOCK_KEY = 'rlaas:retention:request-logs:lock';
const EXPECTED_RELOPTIONS = {
  autovacuum_vacuum_scale_factor: '0.02',
  autovacuum_vacuum_insert_scale_factor: '0.02',
  autovacuum_analyze_scale_factor: '0.02',
};

const prisma = new PrismaClient();
const results = [];

function report(status, check, detail) {
  results.push(status);
  console.log(`${status.padEnd(4)}  ${check}${detail ? ` — ${detail}` : ''}`);
}

function toPlain(value) {
  return JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? Number(v) : v)),
  );
}

/** Depth-first walk of an EXPLAIN (FORMAT JSON) tree. */
function planNodes(node, out = []) {
  if (!node) return out;
  out.push(node);
  for (const child of node.Plans ?? []) planNodes(child, out);
  return out;
}

function explainRoot(rows) {
  const plan = rows[0]['QUERY PLAN'];
  return (typeof plan === 'string' ? JSON.parse(plan) : plan)[0];
}

async function readRedis() {
  const url = process.env.REDIS_URL;
  const client = url
    ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 })
    : new Redis({
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
  try {
    await client.connect();
    const [lastRun, lockTtl] = await Promise.all([client.get(LAST_RUN_KEY), client.ttl(LOCK_KEY)]);
    return { lastRun: lastRun ? JSON.parse(lastRun) : null, lockTtl };
  } finally {
    client.disconnect();
  }
}

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const db = toPlain(
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

        const migrations = await tx.$queryRaw`
          SELECT migration_name, finished_at, rolled_back_at
          FROM _prisma_migrations
          WHERE migration_name IN ('0004_request_logs_created_at_brin', '0005_request_logs_autovacuum')
          ORDER BY migration_name`;

        const index = await tx.$queryRaw`
          SELECT i.indisvalid, i.indisready, am.amname,
                 pg_relation_size(c.oid) AS bytes
          FROM pg_class c
          JOIN pg_index i ON i.indexrelid = c.oid
          JOIN pg_am am ON am.oid = c.relam
          WHERE c.relname = ${BRIN_INDEX}`;

        const table = await tx.$queryRaw`
          SELECT c.reloptions, c.relpages,
                 pg_total_relation_size(c.oid) AS total_bytes,
                 pg_relation_size(c.oid) AS heap_bytes,
                 s.n_live_tup, s.n_dead_tup, s.n_ins_since_vacuum,
                 s.last_autovacuum, s.last_vacuum, s.autovacuum_count,
                 s.last_autoanalyze, s.autoanalyze_count
          FROM pg_class c
          JOIN pg_stat_user_tables s ON s.relid = c.oid
          WHERE c.relname = 'request_logs'`;

        const window = await tx.$queryRaw`
          SELECT count(*)::bigint AS total,
                 count(*) FILTER (WHERE created_at < ${cutoff})::bigint AS past_cutoff,
                 min(created_at) AS oldest,
                 max(created_at) AS newest,
                 count(*) FILTER (WHERE created_at >= now() - interval '35 days')::bigint AS last_35d
          FROM request_logs`;

        // What the planner picks on its own for the job's DELETE.
        const naturalPlan = await tx.$queryRaw`
          EXPLAIN (FORMAT JSON)
          DELETE FROM "request_logs"
          WHERE "id" IN (SELECT "id" FROM "request_logs" WHERE "created_at" < ${cutoff} LIMIT ${5000})`;

        // Force the bitmap path, which is the only one BRIN offers, so the
        // index is exercised even while a seq scan is cheaper. Disabling only
        // seqscan is not enough: count(*) then takes an index-only scan of any
        // B-tree containing created_at (e.g. (decision, created_at)).
        // SET LOCAL ends with this transaction.
        await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
        await tx.$executeRawUnsafe('SET LOCAL enable_indexscan = off');
        await tx.$executeRawUnsafe('SET LOCAL enable_indexonlyscan = off');
        const forcedPlan = await tx.$queryRaw`
          EXPLAIN (FORMAT JSON)
          DELETE FROM "request_logs"
          WHERE "id" IN (SELECT "id" FROM "request_logs" WHERE "created_at" < ${cutoff} LIMIT ${5000})`;
        // Executes a count through the index (a read), for pruning and correctness.
        const forcedCount = await tx.$queryRaw`
          EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT count(*) FROM "request_logs" WHERE "created_at" < ${cutoff}`;
        await tx.$executeRawUnsafe('RESET enable_seqscan');
        await tx.$executeRawUnsafe('RESET enable_indexscan');
        await tx.$executeRawUnsafe('RESET enable_indexonlyscan');

        return { migrations, index, table, window, naturalPlan, forcedPlan, forcedCount };
      },
      { timeout: 60_000 },
    ),
  );

  console.log(`request_logs retention verification (cutoff ${cutoff.toISOString()})\n`);

  // 1. Migrations applied.
  for (const name of ['0004_request_logs_created_at_brin', '0005_request_logs_autovacuum']) {
    const row = db.migrations.find((m) => m.migration_name === name);
    if (!row) report('FAIL', `migration ${name}`, 'not applied (deploy pending?)');
    else if (row.rolled_back_at || !row.finished_at) report('FAIL', `migration ${name}`, 'failed or rolled back');
    else report('PASS', `migration ${name}`, `applied ${row.finished_at}`);
  }

  // 2. BRIN index exists and is valid (CONCURRENTLY can leave it INVALID).
  const index = db.index[0];
  if (!index) report('FAIL', 'BRIN index', `${BRIN_INDEX} does not exist`);
  else if (!index.indisvalid || !index.indisready) report('FAIL', 'BRIN index', 'exists but INVALID: see recovery steps in schema.prisma');
  else report('PASS', 'BRIN index', `${index.amname}, valid, ${index.bytes} bytes`);

  // 3. Per-table autovacuum settings.
  const table = db.table[0];
  const reloptions = Object.fromEntries((table.reloptions ?? []).map((o) => o.split('=')));
  const missing = Object.entries(EXPECTED_RELOPTIONS).filter(([k, v]) => reloptions[k] !== v);
  report(
    missing.length === 0 ? 'PASS' : 'FAIL',
    'autovacuum reloptions',
    missing.length === 0 ? JSON.stringify(reloptions) : `missing/different: ${missing.map(([k]) => k).join(', ')}`,
  );

  // 4. The DELETE can use the BRIN index, and the index returns the right rows.
  const indexNames = (rows) => planNodes(explainRoot(rows).Plan).map((n) => n['Index Name']).filter(Boolean);
  const natural = indexNames(db.naturalPlan);
  const forced = indexNames(db.forcedPlan);
  report(
    'INFO',
    'planner choice for the DELETE',
    natural.includes(BRIN_INDEX)
      ? 'uses the BRIN index'
      : `no BRIN (${natural.join(', ') || 'seq scan'}); expected while the table is only ${table.relpages} pages`,
  );
  if (!index) {
    report('FAIL', 'DELETE via BRIN (forced)', 'index missing');
  } else {
    report(
      forced.includes(BRIN_INDEX) ? 'PASS' : 'FAIL',
      'DELETE via BRIN (forced)',
      forced.includes(BRIN_INDEX) ? 'plan uses Bitmap Index Scan on the BRIN index' : `plan used ${forced.join(', ') || 'no index'}`,
    );

    const countNodes = planNodes(explainRoot(db.forcedCount).Plan);
    const heap = countNodes.find((n) => n['Node Type'] === 'Bitmap Heap Scan');
    const scanned = heap ? (heap['Exact Heap Blocks'] ?? 0) + (heap['Lossy Heap Blocks'] ?? 0) : null;
    const rowsViaIndex = heap ? heap['Actual Rows'] : null;
    if (!heap) {
      report('FAIL', 'BRIN pruning', 'forced count did not use a bitmap heap scan');
    } else {
      report(
        rowsViaIndex === db.window[0].past_cutoff ? 'PASS' : 'FAIL',
        'BRIN correctness',
        `index path found ${rowsViaIndex} rows past cutoff; plain count ${db.window[0].past_cutoff}`,
      );
      report(
        'INFO',
        'BRIN pruning',
        `visited ${scanned} of ${table.relpages} heap pages ` +
          `(${table.relpages ? ((100 * scanned) / table.relpages).toFixed(1) : '0'}%); ` +
          `rows removed by recheck ${heap['Rows Removed by Index Recheck'] ?? 0}`,
      );
    }
  }

  // 5. Retention is holding at ~35 days.
  const w = db.window[0];
  const oldestAgeDays = w.oldest ? (Date.now() - new Date(w.oldest).getTime()) / 86_400_000 : 0;
  if (!w.oldest) report('PASS', 'retention window', 'table is empty');
  else if (oldestAgeDays <= RETENTION_DAYS + 1.1) report('PASS', 'retention window', `oldest row ${oldestAgeDays.toFixed(1)} days old`);
  else if (oldestAgeDays <= RETENTION_DAYS + 3) report('WARN', 'retention window', `oldest row ${oldestAgeDays.toFixed(1)} days old: a run or two missed (instance asleep?)`);
  else report('FAIL', 'retention window', `oldest row ${oldestAgeDays.toFixed(1)} days old: the job is not running`);
  report('INFO', 'rows past cutoff now', `${w.past_cutoff} (the next run deletes these)`);

  // 6. Not growing unbounded: rows should be ~35 days of traffic.
  const perDay = w.last_35d / RETENTION_DAYS;
  report(
    'INFO',
    'size',
    `${w.total} rows, ${(table.total_bytes / 1024 / 1024).toFixed(1)} MB total ` +
      `(${(table.heap_bytes / 1024 / 1024).toFixed(1)} MB heap); ~${perDay.toFixed(0)} rows/day over the last 35 days`,
  );
  if (w.total > 0) {
    const excess = w.total - w.last_35d;
    report(
      excess <= Math.max(perDay * 2, 1000) ? 'PASS' : 'WARN',
      'bounded growth',
      `${excess} rows beyond the 35-day window (≤ about 2 days of traffic is expected between runs)`,
    );
  }

  // 7. Bloat under control.
  const deadRatio = table.n_dead_tup / Math.max(table.n_live_tup + table.n_dead_tup, 1);
  report(
    deadRatio < 0.1 ? 'PASS' : deadRatio < 0.2 ? 'WARN' : 'FAIL',
    'dead tuple ratio',
    `${(deadRatio * 100).toFixed(1)}% (${table.n_dead_tup} dead / ${table.n_live_tup} live); ` +
      `last autovacuum ${table.last_autovacuum ?? 'never'}, count ${table.autovacuum_count}; ` +
      `last autoanalyze ${table.last_autoanalyze ?? 'never'}`,
  );

  // 8. The job itself (Redis record written by RequestLogRetentionService).
  // The record lives in the DEPLOYMENT's Redis. If this machine's env points
  // elsewhere (apps/backend/.env has no REDIS_URL, so it is 127.0.0.1), the
  // record is simply not visible here, and checks 5-7 above (read from
  // Postgres) are the authoritative evidence that the job runs.
  const redisTarget = process.env.REDIS_URL
    ? new URL(process.env.REDIS_URL).hostname
    : `${process.env.REDIS_HOST ?? '127.0.0.1'} (no REDIS_URL)`;
  const localRedis = /^(127\.0\.0\.1|localhost)/.test(redisTarget);
  try {
    const { lastRun, lockTtl } = await readRedis();
    if (!lastRun) {
      report(
        localRedis ? 'INFO' : 'WARN',
        'last job run',
        localRedis
          ? `not visible: Redis here is ${redisTarget}, not the deployment's; rely on the Postgres checks above`
          : 'no run recorded yet (first boot catch-up runs ~60s after a cold start)',
      );
    } else {
      const ageH = (Date.now() - new Date(lastRun.finishedAt).getTime()) / 3_600_000;
      report(
        ageH <= 26 ? 'PASS' : 'WARN',
        'last job run',
        `${lastRun.status}, deleted ${lastRun.deleted} in ${lastRun.batches} batch(es), ${ageH.toFixed(1)}h ago` +
          (ageH > 26 ? ' (fine if the instance has been asleep with no traffic)' : ''),
      );
      if (lastRun.status === 'capped') report('WARN', 'last job run', 'hit the 10M-row cap; the next run continues');
      if (table.last_autovacuum && lastRun.deleted > 0) {
        const vacuumedAfter = new Date(table.last_autovacuum) >= new Date(lastRun.finishedAt);
        report('INFO', 'vacuum after last run', vacuumedAfter ? 'yes' : 'not yet (autovacuum checks every 60s while awake)');
      }
    }
    report('INFO', 'job lock', lockTtl > 0 ? `held, expires in ${lockTtl}s (a run is in progress)` : 'free');
  } catch (error) {
    report('WARN', 'last job run', `Redis unreachable: ${error.message}`);
  }

  const failed = results.includes('FAIL');
  console.log(`\n${failed ? 'FAILED' : 'OK'}: ${results.filter((r) => r === 'FAIL').length} fail, ${results.filter((r) => r === 'WARN').length} warn`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

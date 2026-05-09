import { createHash } from 'crypto';
import Redis from 'ioredis';
import { FixedWindowAlgorithmService } from '../apps/backend/src/algorithms/fixed-window/fixed-window-algorithm.service';
import { SlidingWindowCounterAlgorithmService } from '../apps/backend/src/algorithms/sliding-window-counter/sliding-window-counter-algorithm.service';
import { SlidingWindowLogAlgorithmService } from '../apps/backend/src/algorithms/sliding-window-log/sliding-window-log-algorithm.service';
import { TokenBucketAlgorithmService } from '../apps/backend/src/algorithms/token-bucket/token-bucket-algorithm.service';
import { RateLimitAlgorithm } from '../apps/backend/src/algorithms/algorithm.enum';
import type { RateLimitAlgorithmHandler } from '../apps/backend/src/algorithms/interfaces/rate-limit-algorithm.interface';
import type { RateLimitParams } from '../apps/backend/src/algorithms/interfaces/rate-limit-params.interface';

type BenchmarkRow = {
  algorithm: string;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  memoryDeltaKb: number;
  allowedRequests: number;
  blockedRequests: number;
};

class BenchmarkRedisService {
  constructor(private readonly client: Redis) {}

  getClient() {
    return this.client;
  }
}

const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

function percentile(sorted: number[], value: number) {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((value / 100) * sorted.length) - 1),
  );

  return sorted[index] ?? 0;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

function formatMemory(bytes: number) {
  return Number((bytes / 1024).toFixed(2));
}

async function benchmarkAlgorithm(
  handler: RateLimitAlgorithmHandler,
  params: {
    iterations: number;
    limit: number;
    windowSeconds: number;
    keySeed: string;
    uniqueKeyCount: number;
  },
): Promise<BenchmarkRow> {
  const iterations = params.iterations;
  const latencies: number[] = [];
  let allowedRequests = 0;
  let blockedRequests = 0;

  const startMemory = process.memoryUsage().heapUsed;
  const benchmarkStartedAt = Date.now();

  for (let index = 0; index < iterations; index += 1) {
    const key = `${params.keySeed}:${index % params.uniqueKeyCount}`;
    const nowMs = benchmarkStartedAt + index * 25;
    const started = performance.now();

    const result = await handler.consume({
      key,
      limit: params.limit,
      windowSeconds: params.windowSeconds,
      algorithm: handler.algorithm,
      nowMs,
    } satisfies RateLimitParams);

    const ended = performance.now();
    latencies.push(ended - started);

    if (result.allowed) {
      allowedRequests += 1;
    } else {
      blockedRequests += 1;
    }
  }

  const endMemory = process.memoryUsage().heapUsed;
  const sortedLatencies = [...latencies].sort((left, right) => left - right);

  return {
    algorithm: handler.algorithm,
    averageLatencyMs: Number(average(latencies).toFixed(3)),
    p95LatencyMs: Number(percentile(sortedLatencies, 95).toFixed(3)),
    p99LatencyMs: Number(percentile(sortedLatencies, 99).toFixed(3)),
    memoryDeltaKb: formatMemory(endMemory - startMemory),
    allowedRequests,
    blockedRequests,
  };
}

function printTable(rows: BenchmarkRow[]) {
  const table = rows.map((row) => ({
    Algorithm: row.algorithm,
    'Avg Latency (ms)': row.averageLatencyMs,
    'p95 (ms)': row.p95LatencyMs,
    'p99 (ms)': row.p99LatencyMs,
    'Memory Delta (KB)': row.memoryDeltaKb,
    Allowed: row.allowedRequests,
    Blocked: row.blockedRequests,
  }));

  console.table(table);
}

async function main() {
  await redis.connect();

  const redisService = new BenchmarkRedisService(redis) as never;
  const handlers: RateLimitAlgorithmHandler[] = [
    new FixedWindowAlgorithmService(redisService),
    new SlidingWindowLogAlgorithmService(redisService),
    new SlidingWindowCounterAlgorithmService(redisService),
    new TokenBucketAlgorithmService(redisService),
  ];

  const rows: BenchmarkRow[] = [];

  for (const handler of handlers) {
    await redis.flushdb();
    const keySeed = createHash('sha1')
      .update(handler.algorithm)
      .digest('hex')
      .slice(0, 12);

    const row = await benchmarkAlgorithm(handler, {
      iterations: 500,
      limit: 40,
      windowSeconds: 60,
      keySeed,
      uniqueKeyCount: 4,
    });

    rows.push(row);
  }

  printTable(rows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit();
  });

/**
 * The four limiter algorithms, against a REAL Redis — characterization.
 *
 * The existing unit specs in `src/algorithms/**` mock `eval`, so the Lua never
 * runs and the recorded behaviour is only the JavaScript arithmetic around a
 * fabricated reply. These tests execute the actual scripts, which is the only
 * way to pin down what matters here: expiry, key layout, and atomicity under
 * concurrency.
 *
 * Services are resolved through AlgorithmRegistryService — the same lookup the
 * gateway uses in production.
 */

import { AlgorithmRegistryService } from '../../src/algorithms/algorithm-registry.service';
import { RateLimitAlgorithm } from '../../src/algorithms/algorithm.enum';
import {
  CharacterizationContext,
  createCharacterizationApp,
} from './support/test-app';

/** A window-aligned instant, so window arithmetic in tests is exact. */
const T0 = 1_700_000_000_000;

describe('rate-limit algorithms against a live Redis', () => {
  let ctx: CharacterizationContext;
  let registry: AlgorithmRegistryService;

  beforeAll(async () => {
    ctx = await createCharacterizationApp();
    registry = ctx.app.get(AlgorithmRegistryService);
  });

  afterAll(async () => {
    await ctx.redis.flushdb();
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.redis.flushdb();
  });

  describe('atomicity under concurrency', () => {
    // The decisive property of a distributed limiter: N callers racing on one
    // key must not be able to overspend it. Each algorithm does its
    // read-modify-write inside a single Lua script, so this holds today.
    const cases = [
      [RateLimitAlgorithm.FIXED_WINDOW, 'rlaas:test:concurrency:fixed'],
      [RateLimitAlgorithm.SLIDING_WINDOW_LOG, 'rlaas:test:concurrency:log'],
      [RateLimitAlgorithm.SLIDING_WINDOW_COUNTER, 'rlaas:test:concurrency:counter'],
      [RateLimitAlgorithm.TOKEN_BUCKET, 'rlaas:test:concurrency:bucket'],
    ] as const;

    it.each(cases)('lets exactly 5 of 40 concurrent calls through (%s)', async (
      algorithm,
      key,
    ) => {
      const handler = registry.get(algorithm);

      const results = await Promise.all(
        Array.from({ length: 40 }, () =>
          handler.consume({ key, limit: 5, windowSeconds: 60, algorithm }),
        ),
      );

      expect(results.filter((result) => result.allowed)).toHaveLength(5);
      expect(results.filter((result) => !result.allowed)).toHaveLength(35);
    });
  });

  describe('fixed window', () => {
    const key = 'rlaas:test:fixed';
    const algorithm = RateLimitAlgorithm.FIXED_WINDOW;

    it('stores a plain counter and sets the TTL only on the first call', async () => {
      const handler = registry.get(algorithm);

      const first = await handler.consume({ key, limit: 3, windowSeconds: 30, algorithm });
      const firstTtl = await ctx.redis.pttl(key);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const second = await handler.consume({ key, limit: 3, windowSeconds: 30, algorithm });
      const secondTtl = await ctx.redis.pttl(key);

      expect(await ctx.redis.get(key)).toBe('2');
      expect(first).toEqual({
        allowed: true,
        limit: 3,
        remaining: 2,
        retryAfter: 0,
        algorithm,
      });
      expect(second.remaining).toBe(1);

      expect(firstTtl).toBeGreaterThan(29_000);
      expect(secondTtl).toBeLessThan(firstTtl);
    });

    it('reports retryAfter as the remaining whole seconds once blocked', async () => {
      const handler = registry.get(algorithm);

      await handler.consume({ key, limit: 1, windowSeconds: 30, algorithm });
      const blocked = await handler.consume({ key, limit: 1, windowSeconds: 30, algorithm });

      expect(blocked).toEqual({
        allowed: false,
        limit: 1,
        remaining: 0,
        retryAfter: 30,
        algorithm,
      });
    });

    it('lets the counter through again after the key really expires', async () => {
      const handler = registry.get(algorithm);

      await handler.consume({ key, limit: 1, windowSeconds: 1, algorithm });
      expect(
        (await handler.consume({ key, limit: 1, windowSeconds: 1, algorithm })).allowed,
      ).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 1_300));

      expect(await ctx.redis.exists(key)).toBe(0);
      expect(
        (await handler.consume({ key, limit: 1, windowSeconds: 1, algorithm })).allowed,
      ).toBe(true);
    });
  });

  describe('sliding window log', () => {
    const key = 'rlaas:test:log';
    const algorithm = RateLimitAlgorithm.SLIDING_WINDOW_LOG;

    it('keeps one sorted-set member per allowed request and expires the set', async () => {
      const handler = registry.get(algorithm);

      for (let index = 0; index < 3; index += 1) {
        await handler.consume({ key, limit: 3, windowSeconds: 30, algorithm });
      }

      expect(await ctx.redis.type(key)).toBe('zset');
      expect(await ctx.redis.zcard(key)).toBe(3);

      const ttl = await ctx.redis.pttl(key);
      expect(ttl).toBeGreaterThan(28_000);
      expect(ttl).toBeLessThanOrEqual(30_000);
    });

    it('drops entries that have aged out of the window', async () => {
      const handler = registry.get(algorithm);

      await handler.consume({
        key, limit: 2, windowSeconds: 10, algorithm, nowMs: T0,
      });
      await handler.consume({
        key, limit: 2, windowSeconds: 10, algorithm, nowMs: T0 + 1_000,
      });

      const blocked = await handler.consume({
        key, limit: 2, windowSeconds: 10, algorithm, nowMs: T0 + 2_000,
      });
      expect(blocked.allowed).toBe(false);
      // Oldest entry is 2s into a 10s window, so 8s remain.
      expect(blocked.retryAfter).toBe(8);

      // At T0+11500 the window floor is T0+1500, so BOTH earlier entries are
      // trimmed by score and only the newly added one survives.
      const afterAging = await handler.consume({
        key, limit: 2, windowSeconds: 10, algorithm, nowMs: T0 + 11_500,
      });
      expect(afterAging.allowed).toBe(true);
      expect(await ctx.redis.zcard(key)).toBe(1);
    });

    it('reports remaining as limit minus the post-insert count', async () => {
      const handler = registry.get(algorithm);

      const first = await handler.consume({ key, limit: 3, windowSeconds: 30, algorithm });

      // KNOWN-ODD: fixed window reports `limit - current` after incrementing
      // too, but the log variant counts the member it just added, so the two
      // algorithms agree only by coincidence. Recorded, not judged.
      expect(first.remaining).toBe(2);
    });
  });

  describe('sliding window counter', () => {
    const key = 'rlaas:test:counter';
    const algorithm = RateLimitAlgorithm.SLIDING_WINDOW_COUNTER;

    it('never writes the previous-window key it reads from', async () => {
      const handler = registry.get(algorithm);

      await handler.consume({
        key, limit: 5, windowSeconds: 2, algorithm, nowMs: T0 + 100,
      });

      const allKeys = await ctx.redis.keys('rlaas:test:counter*');

      // KNOWN-ODD — CORRECTNESS. The script increments `<key>:current:<n>` but
      // reads the previous window from `<key>:previous:<n-1>`, which nothing in
      // the codebase ever writes. `previousCount` is therefore always 0 and the
      // weighted term is dead code.
      expect(allKeys).toEqual([`${key}:current:${Math.floor((T0 + 100) / 2_000)}`]);
      expect(await ctx.redis.keys('*:previous:*')).toEqual([]);
    });

    it('forgets a full previous window the instant a new one starts', async () => {
      const handler = registry.get(algorithm);
      const params = { key, limit: 5, windowSeconds: 2, algorithm };

      for (let index = 0; index < 5; index += 1) {
        await handler.consume({ ...params, nowMs: T0 + 100 });
      }

      const blockedInWindow = await handler.consume({ ...params, nowMs: T0 + 100 });
      expect(blockedInWindow.allowed).toBe(false);

      // T0 + 2000 is the first millisecond of the next window, where the
      // weight of the previous window is 1.0. A working sliding-window counter
      // would still block here, because the previous window is full.
      const atBoundary = await handler.consume({ ...params, nowMs: T0 + 2_000 });

      // KNOWN-ODD — CORRECTNESS. It allows. With previousCount pinned at 0 the
      // algorithm degrades to a fixed window and permits up to 2x the limit
      // across a boundary. This assertion exists to fail loudly the day the
      // previous-window key is implemented.
      expect(atBoundary.allowed).toBe(true);
      expect(atBoundary.remaining).toBe(4);
    });

    it('gives the current-window counter twice the window as its TTL', async () => {
      const handler = registry.get(algorithm);

      await handler.consume({
        key, limit: 5, windowSeconds: 2, algorithm, nowMs: T0 + 100,
      });

      const currentKey = `${key}:current:${Math.floor((T0 + 100) / 2_000)}`;
      const ttl = await ctx.redis.pttl(currentKey);

      expect(ttl).toBeGreaterThan(3_000);
      expect(ttl).toBeLessThanOrEqual(4_000);
    });
  });

  describe('token bucket', () => {
    const key = 'rlaas:test:bucket';
    const algorithm = RateLimitAlgorithm.TOKEN_BUCKET;

    it('stores tokens and updatedAt in a hash with twice the window as TTL', async () => {
      const handler = registry.get(algorithm);

      await handler.consume({
        key, limit: 10, windowSeconds: 10, algorithm, nowMs: T0,
      });

      expect(await ctx.redis.type(key)).toBe('hash');
      const stored = await ctx.redis.hgetall(key);
      expect(Number(stored.tokens)).toBeCloseTo(9, 5);
      expect(stored.updatedAt).toBe(String(T0));

      const ttl = await ctx.redis.pttl(key);
      expect(ttl).toBeGreaterThan(19_000);
      expect(ttl).toBeLessThanOrEqual(20_000);
    });

    it('refills at limit/window tokens per second', async () => {
      const handler = registry.get(algorithm);
      const params = { key, limit: 10, windowSeconds: 10, algorithm };

      for (let index = 0; index < 10; index += 1) {
        await handler.consume({ ...params, nowMs: T0 });
      }

      const empty = await handler.consume({ ...params, nowMs: T0 });
      expect(empty).toEqual({
        allowed: false,
        limit: 10,
        remaining: 0,
        retryAfter: 1,
        algorithm,
      });

      // 1 token per second at 10 per 10s: three seconds buys three requests.
      const afterThreeSeconds = await handler.consume({ ...params, nowMs: T0 + 3_000 });
      expect(afterThreeSeconds).toEqual({
        allowed: true,
        limit: 10,
        remaining: 2,
        retryAfter: 0,
        algorithm,
      });
    });

    it('never refills beyond capacity however long the bucket idles', async () => {
      const handler = registry.get(algorithm);
      const params = { key, limit: 10, windowSeconds: 10, algorithm };

      await handler.consume({ ...params, nowMs: T0 });
      const afterLongIdle = await handler.consume({
        ...params,
        nowMs: T0 + 3_600_000,
      });

      expect(afterLongIdle.remaining).toBe(9);
    });

    it('ignores clock values older than the stored timestamp instead of draining', async () => {
      const handler = registry.get(algorithm);
      const params = { key, limit: 10, windowSeconds: 10, algorithm };

      await handler.consume({ ...params, nowMs: T0 + 60_000 });
      const fromABehindClock = await handler.consume({ ...params, nowMs: T0 });

      // KNOWN-ODD: elapsed time is clamped at 0, so a lagging instance simply
      // gets no refill — but it also rewrites `updatedAt` to its own older
      // clock, so the next caller is credited for time that already elapsed.
      expect(fromABehindClock.allowed).toBe(true);
      expect(await ctx.redis.hget(key, 'updatedAt')).toBe(String(T0));
    });
  });
});

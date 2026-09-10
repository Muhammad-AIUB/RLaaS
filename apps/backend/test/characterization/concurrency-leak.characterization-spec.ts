/**
 * Does the limit leak when many requests hit ONE key at the same instant?
 *
 * This is the question that decides whether the product works at all. A rate
 * limiter that lets 12 through on a limit of 10 under load is not a rate
 * limiter. Every test here drives 100 genuinely parallel requests at a single
 * key against a REAL Redis.
 *
 * Three layers are exercised:
 *   1. the HTTP gateway endpoint (what the server promises)
 *   2. the real express-sdk middleware (where 429 is actually produced)
 *   3. the algorithms directly, including a deterministic clock-skew case
 */

import { RuleAlgorithm } from '@prisma/client';
import { AlgorithmRegistryService } from '../../src/algorithms/algorithm-registry.service';
import { RateLimitAlgorithm } from '../../src/algorithms/algorithm.enum';
import { createRlaasMiddleware } from '../../../../packages/express-sdk/src/index';
import {
  CharacterizationContext,
  createCharacterizationApp,
  hashApiKey,
} from './support/test-app';

const PROJECT_ID = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
const API_KEY_ID = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const RAW_KEY = 'rlaas_live_concurrency_probe';

const LIMIT = 10;
const BURST = 100;

/** A window-aligned instant, so token-bucket arithmetic in tests is exact. */
const T0 = 1_700_000_000_000;

describe('limit leakage under concurrency', () => {
  let ctx: CharacterizationContext;
  let gatewayUrl: string;

  const seedApiKey = () => {
    ctx.prisma.apiKeys.push({
      id: API_KEY_ID,
      projectId: PROJECT_ID,
      name: 'Concurrency probe',
      keyPrefix: RAW_KEY.slice(0, 18),
      hashedKey: hashApiKey(RAW_KEY),
      hashVersion: 'hmac-sha256-v1',
      status: 'ACTIVE',
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  };

  const seedRule = (algorithm: RuleAlgorithm) => {
    ctx.prisma.rules.push({
      id: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
      projectId: PROJECT_ID,
      name: `Ten per minute (${algorithm})`,
      description: null,
      priority: 1,
      scope: 'GLOBAL',
      targetValue: null,
      endpointPattern: null,
      method: null,
      userTier: null,
      algorithm,
      limit: LIMIT,
      windowSeconds: 60,
      burstCapacity: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  };

  /** Fires N gateway checks that are all in flight simultaneously. */
  const burst = async (endpoint: string, count = BURST) => {
    const payload = (index: number) =>
      JSON.stringify({
        apiKey: RAW_KEY,
        ip: `203.0.113.${index % 250}`,
        endpoint,
        method: 'GET',
        userTier: 'free',
      });

    return Promise.all(
      Array.from({ length: count }, (_unused, index) =>
        fetch(gatewayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload(index),
        }).then(async (response) => ({
          status: response.status,
          body: (await response.json()) as Record<string, unknown>,
        })),
      ),
    );
  };

  beforeAll(async () => {
    ctx = await createCharacterizationApp();
    // A real listening socket: 100 parallel supertest calls would each try to
    // bind the server themselves.
    await ctx.app.listen(0);
    const { port } = ctx.app.getHttpServer().address() as { port: number };
    gatewayUrl = `http://127.0.0.1:${port}/api/v1/gateway/check`;
  });

  afterAll(async () => {
    await ctx.redis.flushdb();
    await ctx.close();
  });

  beforeEach(async () => {
    ctx.prisma.reset();
    await ctx.redis.flushdb();
    seedApiKey();
  });

  describe('the HTTP gateway', () => {
    it('lets exactly 10 of 100 simultaneous requests through', async () => {
      seedRule(RuleAlgorithm.FIXED_WINDOW);

      // A burst that is secretly serial would prove nothing, so measure how many
      // requests are genuinely being served at the same moment: the span from
      // the server accepting a request to it closing the response, which
      // contains the Redis round trip the limiter actually runs in.
      //
      // This used to wrap the in-memory rule lookup instead and assert its
      // depth. That counted how many handlers resumed in a single microtask
      // drain, which is just how many Redis replies arrived in one TCP data
      // event: ~64 against a loopback Redis, 5 against a containerised one on a
      // 2-vCPU CI runner. It measured the transport, not the limiter, so CI
      // failed on a machine where the limiter was behaving perfectly.
      let inFlight = 0;
      let peakInFlight = 0;
      const server = ctx.app.getHttpServer();
      const observe = (_request: unknown, response: { on: (event: string, listener: () => void) => void }) => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        response.on('close', () => {
          inFlight -= 1;
        });
      };
      server.on('request', observe);

      let responses;
      try {
        responses = await burst('/api/products');
      } finally {
        server.off('request', observe);
      }

      // More requests were in flight at once than the limit itself, which is
      // the condition under which a non-atomic limiter leaks.
      expect(peakInFlight).toBeGreaterThan(LIMIT);

      const allowed = responses.filter((response) => response.body.allowed === true);
      const blocked = responses.filter((response) => response.body.allowed === false);

      expect(allowed).toHaveLength(LIMIT);
      expect(blocked).toHaveLength(BURST - LIMIT);

      // No decision is lost or double-counted: the Redis counter saw all 100.
      const key = [
        'rlaas', PROJECT_ID, 'fixed_window', 'GLOBAL', 'global',
        'GET', '/api/products', 'free',
      ].join(':');
      expect(await ctx.redis.get(key)).toBe(String(BURST));

      // Every allowed response carries a distinct remaining value, 9 down to 0:
      // the increment is atomic, so no two winners saw the same counter.
      const remainings = allowed
        .map((response) => response.body.remaining as number)
        .sort((left, right) => left - right);
      expect(remainings).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('answers blocked requests with 201, never 429', async () => {
      seedRule(RuleAlgorithm.FIXED_WINDOW);

      const responses = await burst('/api/products');
      const blocked = responses.filter((response) => response.body.allowed === false);

      // KNOWN-ODD: the gateway is an advice endpoint, not a proxy — a rejected
      // request is still a successful HTTP call, and Nest's default POST status
      // is never overridden. There is no 429 anywhere in the server; the SDK is
      // what turns `allowed: false` into one (see the next block).
      expect(responses.every((response) => response.status === 201)).toBe(true);
      expect(responses.some((response) => response.status === 429)).toBe(false);
      expect(blocked[0].body).toMatchObject({
        allowed: false,
        reason: 'RATE_LIMIT_EXCEEDED',
        remaining: 0,
      });
    });

    it.each([
      [RuleAlgorithm.FIXED_WINDOW],
      [RuleAlgorithm.SLIDING_WINDOW_LOG],
      [RuleAlgorithm.SLIDING_WINDOW_COUNTER],
      [RuleAlgorithm.TOKEN_BUCKET],
    ])('holds the limit at exactly 10 under a 100-way burst (%s)', async (algorithm) => {
      seedRule(algorithm);

      const responses = await burst(`/api/burst-${algorithm.toLowerCase()}`);
      const allowed = responses.filter((response) => response.body.allowed === true);

      expect(allowed).toHaveLength(LIMIT);
    });
  });

  describe('through the real express-sdk middleware', () => {
    it('calls next() exactly 10 times and returns 429 for the other 90', async () => {
      seedRule(RuleAlgorithm.FIXED_WINDOW);

      const middleware = createRlaasMiddleware({
        apiKey: RAW_KEY,
        gatewayUrl,
      });

      const runOnce = async (index: number) => {
        let nexted = false;
        const headers: Record<string, string> = {};
        let statusCode = 0;
        let body: Record<string, unknown> | undefined;

        const request = {
          headers: {},
          ip: `198.51.100.${index % 250}`,
          method: 'GET',
          originalUrl: '/api/sdk-burst?page=2',
          url: '/api/sdk-burst?page=2',
          socket: { remoteAddress: '198.51.100.1' },
        };

        const response = {
          setHeader: (name: string, value: string) => {
            headers[name] = String(value);
          },
          status: (code: number) => {
            statusCode = code;
            return response;
          },
          json: (payload: Record<string, unknown>) => {
            body = payload;
            return response;
          },
        };

        await middleware(
          request as never,
          response as never,
          (() => {
            nexted = true;
          }) as never,
        );

        return { nexted, statusCode, headers, body };
      };

      const results = await Promise.all(
        Array.from({ length: BURST }, (_unused, index) => runOnce(index)),
      );

      const passed = results.filter((result) => result.nexted);
      const throttled = results.filter((result) => result.statusCode === 429);

      expect(passed).toHaveLength(LIMIT);
      expect(throttled).toHaveLength(BURST - LIMIT);

      // The 429s carry the headers a client needs to back off.
      expect(throttled[0].headers['Retry-After']).toMatch(/^\d+$/);
      expect(throttled[0].headers['X-RateLimit-Limit']).toBe('10');
      expect(throttled[0].headers['X-RateLimit-Remaining']).toBe('0');
      expect(throttled[0].body).toMatchObject({
        error: 'RATE_LIMIT_EXCEEDED',
        limit: 10,
        remaining: 0,
      });

      // Winners get their headers too, and no body of their own.
      expect(passed[0].statusCode).toBe(0);
      expect(passed[0].headers['X-RateLimit-Algorithm']).toBe('fixed_window');
    });
  });

  describe('where the limit CAN still leak', () => {
    it('double-consumes when the same idempotency key arrives in parallel', async () => {
      seedRule(RuleAlgorithm.FIXED_WINDOW);

      const parallel = 20;
      const responses = await Promise.all(
        Array.from({ length: parallel }, () =>
          fetch(gatewayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: RAW_KEY,
              ip: '203.0.113.10',
              endpoint: '/api/idempotent',
              method: 'GET',
              userTier: 'free',
              idempotencyKey: 'same-key-for-all',
            }),
          }).then((response) => response.json() as Promise<Record<string, unknown>>),
        ),
      );

      const key = [
        'rlaas', PROJECT_ID, 'fixed_window', 'GLOBAL', 'global',
        'GET', '/api/idempotent', 'free',
      ].join(':');
      const consumed = Number(await ctx.redis.get(key));

      // KNOWN-ODD — RACE. One logical request consumed many tokens. The
      // idempotency guard is a GET followed later by a SET (no NX, no lock), so
      // every request in the burst misses the empty cache and calls consume()
      // before the first response is written back.
      // rate-limiter.service.ts:153-163 (read) and :204-211 (write).
      expect(consumed).toBeGreaterThan(1);
      expect(
        responses.filter((response) => response.idempotencyStatus === 'created').length,
      ).toBeGreaterThan(1);

      // The limit itself still holds — over-charging, not leaking.
      expect(responses.filter((response) => response.allowed === true)).toHaveLength(
        Math.min(LIMIT, parallel),
      );
    });

    it('mints extra tokens when two callers disagree about the clock', async () => {
      const registry = ctx.app.get(AlgorithmRegistryService);
      const handler = registry.get(RateLimitAlgorithm.TOKEN_BUCKET);
      const key = 'rlaas:test:leak:token-bucket';

      // 10 tokens per second, so 200 ms of real time is worth exactly 2 tokens.
      const params = {
        key,
        limit: 10,
        windowSeconds: 1,
        algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
      };

      for (let index = 0; index < 10; index += 1) {
        await handler.consume({ ...params, nowMs: T0 });
      }
      expect((await handler.consume({ ...params, nowMs: T0 })).allowed).toBe(false);

      // An instance whose clock reads T0+200 credits the 200 ms and spends one.
      const ahead = await handler.consume({ ...params, nowMs: T0 + 200 });

      // A second instance lagging 200 ms behind spends another — and, because
      // the script writes its own clock unconditionally, rewinds updatedAt.
      const behind = await handler.consume({ ...params, nowMs: T0 });
      expect(await ctx.redis.hget(key, 'updatedAt')).toBe(String(T0));

      // The first instance now credits the SAME 200 ms a second time.
      const again = await handler.consume({ ...params, nowMs: T0 + 200 });
      const andAgain = await handler.consume({ ...params, nowMs: T0 + 200 });
      const finallyBlocked = await handler.consume({ ...params, nowMs: T0 + 200 });

      // KNOWN-ODD — RACE. Four requests were served for 200 ms of elapsed time
      // that only entitled the caller to two. `nowMs` is supplied by whichever
      // process happens to handle the request, `elapsedMs` is clamped at 0
      // instead of rejecting a stale clock, and the HSET at
      // token-bucket-algorithm.service.ts:38 stores that stale clock, so the
      // same interval is refilled again by the next caller.
      expect([ahead.allowed, behind.allowed, again.allowed, andAgain.allowed]).toEqual([
        true,
        true,
        true,
        true,
      ]);
      expect(finallyBlocked.allowed).toBe(false);
    });
  });
});

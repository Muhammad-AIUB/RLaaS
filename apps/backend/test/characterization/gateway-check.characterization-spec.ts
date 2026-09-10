/**
 * POST /api/v1/gateway/check — characterization.
 *
 * These tests record what the endpoint does TODAY, including behaviour that
 * looks wrong. Anything questionable is asserted exactly as it currently
 * behaves and flagged with a KNOWN-ODD comment. Do not "fix" a test here
 * without deliberately changing the product behaviour it pins down.
 *
 * Redis is real: counters, TTLs and Lua atomicity are exercised against a
 * live server, not a mock.
 */

import { ApiKeyStatus, RequestDecision } from '@prisma/client';
import request from 'supertest';
import {
  CharacterizationContext,
  createCharacterizationApp,
  flushDeferredWork,
  hashApiKey,
  rateLimitKey,
} from './support/test-app';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const API_KEY_ID = '22222222-2222-4222-8222-222222222222';
const RAW_KEY = 'rlaas_live_characterization_key';

describe('POST /api/v1/gateway/check', () => {
  let ctx: CharacterizationContext;

  const post = (body: unknown) =>
    request(ctx.app.getHttpServer()).post('/api/v1/gateway/check').send(body);

  const validRequest = (overrides: Record<string, unknown> = {}) => ({
    apiKey: RAW_KEY,
    ip: '203.0.113.10',
    endpoint: '/api/products',
    method: 'GET',
    userTier: 'free',
    ...overrides,
  });

  const seedApiKey = (overrides: Record<string, unknown> = {}) => {
    ctx.prisma.apiKeys.push({
      id: API_KEY_ID,
      projectId: PROJECT_ID,
      name: 'Characterization key',
      keyPrefix: RAW_KEY.slice(0, 18),
      hashedKey: hashApiKey(RAW_KEY),
      hashVersion: 'hmac-sha256-v1',
      status: ApiKeyStatus.ACTIVE,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    });
  };

  const seedRule = (overrides: Record<string, unknown> = {}) => {
    const rule = {
      id: '33333333-3333-4333-8333-333333333333',
      projectId: PROJECT_ID,
      name: 'Two per minute',
      description: null,
      priority: 1,
      scope: 'GLOBAL',
      targetValue: null,
      endpointPattern: null,
      method: null,
      userTier: null,
      algorithm: 'FIXED_WINDOW',
      limit: 2,
      windowSeconds: 60,
      burstCapacity: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
    ctx.prisma.rules.push(rule);
    return rule;
  };

  beforeAll(async () => {
    ctx = await createCharacterizationApp();
  });

  afterAll(async () => {
    await ctx.redis.flushdb();
    await ctx.close();
  });

  beforeEach(async () => {
    ctx.prisma.reset();
    await ctx.redis.flushdb();
  });

  describe('response envelope', () => {
    it('returns 201 with the default-rule decision when the project has no rules', async () => {
      seedApiKey();

      const response = await post(validRequest());

      // KNOWN-ODD: a rate-limit *decision* is returned as 201 Created. Nest's
      // default POST status is never overridden with @HttpCode(200).
      expect(response.status).toBe(201);

      // Falls back to buildDefaultRule() from RATE_LIMIT_DEFAULT_* env values.
      expect(response.body).toEqual({
        allowed: true,
        limit: 100,
        remaining: 99,
        retryAfter: 0,
        algorithm: 'fixed_window',
        ruleName: 'Default global rule',
        scope: 'GLOBAL',
      });

      // KNOWN-ODD: `reason` and `ruleId` are set to `undefined` rather than
      // omitted, so they vanish during JSON serialisation. Clients cannot rely
      // on the keys existing.
      expect(Object.keys(response.body).sort()).toEqual([
        'algorithm',
        'allowed',
        'limit',
        'remaining',
        'retryAfter',
        'ruleName',
        'scope',
      ]);
    });

    it('counts down `remaining` and blocks the request after the limit', async () => {
      seedApiKey();
      const rule = seedRule();

      const first = await post(validRequest());
      const second = await post(validRequest());
      const third = await post(validRequest());

      expect(first.body).toMatchObject({ allowed: true, limit: 2, remaining: 1 });
      expect(second.body).toMatchObject({ allowed: true, limit: 2, remaining: 0 });

      expect(third.status).toBe(201);
      expect(third.body).toMatchObject({
        allowed: false,
        reason: 'RATE_LIMIT_EXCEEDED',
        limit: 2,
        remaining: 0,
        algorithm: 'fixed_window',
        ruleId: rule.id,
        ruleName: 'Two per minute',
        scope: 'GLOBAL',
      });

      // retryAfter is the live Redis TTL, in whole seconds.
      expect(third.body.retryAfter).toBeGreaterThan(55);
      expect(third.body.retryAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('Redis state (real server, real TTL)', () => {
    it('writes the counter under the composed key and gives it the window TTL', async () => {
      seedApiKey();
      seedRule();

      await post(validRequest());

      const key = rateLimitKey({
        projectId: PROJECT_ID,
        algorithm: 'fixed_window',
        scope: 'GLOBAL',
        scopeValue: 'global',
        ruleId: '33333333-3333-4333-8333-333333333333',
      });

      expect(await ctx.redis.get(key)).toBe('1');

      const ttl = await ctx.redis.pttl(key);
      expect(ttl).toBeGreaterThan(55_000);
      expect(ttl).toBeLessThanOrEqual(60_000);
    });

    it('does not extend the TTL on later requests inside the same window', async () => {
      seedApiKey();
      seedRule({ windowSeconds: 30 });

      const key = rateLimitKey({
        projectId: PROJECT_ID,
        algorithm: 'fixed_window',
        scope: 'GLOBAL',
        scopeValue: 'global',
        ruleId: '33333333-3333-4333-8333-333333333333',
      });

      await post(validRequest());
      const firstTtl = await ctx.redis.pttl(key);

      await new Promise((resolve) => setTimeout(resolve, 400));
      await post(validRequest());
      const secondTtl = await ctx.redis.pttl(key);

      // EXPIRE is only issued when the counter reads 1, so the window keeps
      // draining rather than sliding. This is the intended fixed-window shape.
      expect(secondTtl).toBeLessThan(firstTtl);
    });

    it('expires the counter for real once the window elapses', async () => {
      seedApiKey();
      seedRule({ limit: 1, windowSeconds: 1 });

      const first = await post(validRequest());
      const blocked = await post(validRequest());

      expect(first.body.allowed).toBe(true);
      expect(blocked.body.allowed).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 1_300));

      const afterWindow = await post(validRequest());
      expect(afterWindow.body).toMatchObject({ allowed: true, remaining: 0 });
    });
  });

  describe('rule scoping', () => {
    // WAS KNOWN-ODD, NOW FIXED: a GLOBAL rule used to compose its key from
    // method + endpoint + tier, so "1 request per minute, globally" was really
    // 1 per minute per endpoint per method per tier — and all three are picked
    // by the caller. See the scope-dilution regressions in
    // production-hardening.characterization-spec.ts.
    it('spends one GLOBAL budget across every endpoint', async () => {
      seedApiKey();
      seedRule({ limit: 1 });

      const onProducts = await post(validRequest({ endpoint: '/api/products' }));
      const alsoProducts = await post(validRequest({ endpoint: '/api/products' }));
      const onOrders = await post(validRequest({ endpoint: '/api/orders' }));

      expect(onProducts.body.allowed).toBe(true);
      expect(alsoProducts.body.allowed).toBe(false);
      expect(onOrders.body.allowed).toBe(false);
    });

    it('spends one GLOBAL budget across every caller-declared tier', async () => {
      seedApiKey();
      seedRule({ limit: 1 });

      const asFree = await post(validRequest({ userTier: 'free' }));
      const asFreeAgain = await post(validRequest({ userTier: 'free' }));
      const asEnterprise = await post(validRequest({ userTier: 'enterprise' }));

      expect(asFree.body.allowed).toBe(true);
      expect(asFreeAgain.body.allowed).toBe(false);

      // The caller can still name any tier it likes, but under a GLOBAL rule
      // that no longer buys it a fresh bucket. Picking its own LIMIT via a
      // USER_TIER rule remains possible by design: the tier is client-declared.
      expect(asEnterprise.body.allowed).toBe(false);
    });
  });

  describe('API key validation', () => {
    it('answers 201 with a rejection body for an unknown key', async () => {
      const response = await post(validRequest({ apiKey: 'rlaas_live_not_a_key' }));

      // KNOWN-ODD: an unauthenticated caller gets 201 + a decision body rather
      // than 401/403, and `algorithm` is hardcoded to fixed_window even though
      // no algorithm ran.
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        allowed: false,
        reason: 'API_KEY_INVALID',
        limit: 0,
        remaining: 0,
        retryAfter: 0,
        algorithm: 'fixed_window',
      });
    });

    it('rejects a revoked key', async () => {
      seedApiKey({ status: ApiKeyStatus.REVOKED });

      const response = await post(validRequest());

      expect(response.body).toMatchObject({
        allowed: false,
        reason: 'API_KEY_REVOKED',
      });
    });

    it('rejects an expired key on the first call and then ALLOWS it from cache', async () => {
      seedApiKey({ expiresAt: new Date('2020-01-01T00:00:00.000Z') });

      const fromDatabase = await post(validRequest());
      const fromCache = await post(validRequest());

      expect(fromDatabase.body).toMatchObject({
        allowed: false,
        reason: 'API_KEY_REVOKED',
      });

      // KNOWN-ODD — SECURITY. findByRawKey caches the row as JSON for 30s. On
      // the way back out `expiresAt` is a string, and `'2020-01-01...' <= new
      // Date()` coerces to NaN, so the expiry check silently passes. An expired
      // key is therefore honoured for the lifetime of the cache entry.
      expect(fromCache.body.allowed).toBe(true);
      expect(fromCache.body.reason).toBeUndefined();

      const cached = await ctx.redis.get(`cache:apikey:${hashApiKey(RAW_KEY)}`);
      expect(typeof JSON.parse(cached as string).expiresAt).toBe('string');
    });
  });

  describe('idempotency', () => {
    it('replays the stored response and does not consume a second token', async () => {
      seedApiKey();
      seedRule();

      const key = rateLimitKey({
        projectId: PROJECT_ID,
        algorithm: 'fixed_window',
        scope: 'GLOBAL',
        scopeValue: 'global',
        ruleId: '33333333-3333-4333-8333-333333333333',
      });

      const created = await post(validRequest({ idempotencyKey: 'idem-001' }));
      expect(created.body).toMatchObject({
        allowed: true,
        remaining: 1,
        idempotencyStatus: 'created',
      });
      expect(await ctx.redis.get(key)).toBe('1');

      const replayed = await post(validRequest({ idempotencyKey: 'idem-001' }));
      expect(replayed.body).toMatchObject({
        allowed: true,
        remaining: 1,
        idempotencyStatus: 'replayed',
      });

      // The counter did not move: the replay short-circuits before consume().
      expect(await ctx.redis.get(key)).toBe('1');
    });

    it('treats a different idempotency key as a new request', async () => {
      seedApiKey();
      seedRule();

      await post(validRequest({ idempotencyKey: 'idem-001' }));
      const second = await post(validRequest({ idempotencyKey: 'idem-002' }));

      expect(second.body).toMatchObject({
        remaining: 0,
        idempotencyStatus: 'created',
      });
    });
  });

  describe('request validation', () => {
    it('rejects a missing apiKey with the standard error envelope', async () => {
      const response = await post({
        ip: '203.0.113.10',
        endpoint: '/api/products',
        method: 'GET',
        userTier: 'free',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: [
            'apiKey must be shorter than or equal to 255 characters',
            'apiKey should not be empty',
            'apiKey must be a string',
          ],
          statusCode: 400,
          path: '/api/v1/gateway/check',
          timestamp: expect.any(String),
        },
      });
    });

    it('rejects a non-IP value for `ip`', async () => {
      const response = await post(validRequest({ ip: 'not-an-ip' }));

      expect(response.status).toBe(400);
      expect(response.body.error.message).toEqual(['ip must be an ip address']);
    });

    it('rejects unknown properties', async () => {
      const response = await post(validRequest({ unexpected: 'value' }));

      expect(response.status).toBe(400);
      expect(response.body.error.message).toEqual([
        'property unexpected should not exist',
      ]);
    });

    // WAS KNOWN-ODD, NOW FIXED: `method` was only @IsString/@MaxLength(16),
    // then cast to the Prisma HttpMethod enum when the request log was
    // written. On a real database the decision was served and the log write
    // threw, so traffic with a nonstandard verb was rate limited but invisible
    // to analytics, lastUsedAt and the webhook blocked-spike counts.
    it('rejects a `method` outside the HTTP verbs it can record', async () => {
      seedApiKey();

      const response = await post(validRequest({ method: 'TELEPORT' }));

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('method');
    });

    it('accepts a lowercase method and normalizes it', async () => {
      seedApiKey();
      seedRule();

      const response = await post(validRequest({ method: 'get' }));

      expect(response.status).toBe(201);
      expect(response.body.allowed).toBe(true);
    });
  });

  describe('deferred side effects', () => {
    it('answers the caller without waiting for the request-log write', async () => {
      seedApiKey();
      seedRule();

      const original = ctx.prisma.requestLog.create;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      ctx.prisma.requestLog.create = (async (args: any) => {
        await gate;
        return original(args);
      }) as typeof original;

      try {
        const startedAt = Date.now();
        const response = await post(validRequest());
        const elapsedMs = Date.now() - startedAt;

        // Intentional: persistRequestOutcome is launched with `void`, so the
        // decision is returned while the log write is still blocked. The caller
        // must not pay for the log write. Its rejection is caught and logged
        // (C4); the row is still lost, which is what the KNOWN-ODD below the
        // `method` test records.
        expect(response.status).toBe(201);
        expect(response.body.allowed).toBe(true);
        expect(elapsedMs).toBeLessThan(1_000);
        expect(ctx.prisma.requestLogs).toHaveLength(0);

        release();
        await flushDeferredWork();
        expect(ctx.prisma.requestLogs).toHaveLength(1);
      } finally {
        ctx.prisma.requestLog.create = original;
      }
    });

    it('writes the request log and stamps lastUsedAt', async () => {
      seedApiKey();
      seedRule();

      await post(validRequest());
      await flushDeferredWork();

      expect(ctx.prisma.requestLogs).toHaveLength(1);
      expect(ctx.prisma.requestLogs[0]).toMatchObject({
        projectId: PROJECT_ID,
        apiKeyId: API_KEY_ID,
        decision: RequestDecision.ALLOWED,
        endpoint: '/api/products',
        method: 'GET',
        userTier: 'FREE',
        algorithm: 'FIXED_WINDOW',
        limit: 2,
        remaining: 1,
        metadata: { scope: 'GLOBAL', ruleName: 'Two per minute' },
      });

      expect(ctx.prisma.apiKeys[0].lastUsedAt).toBeInstanceOf(Date);
    });

    it('records an unrecognised tier as null on the log row', async () => {
      seedApiKey();

      await post(validRequest({ userTier: 'platinum' }));
      await flushDeferredWork();

      // KNOWN-ODD: the tier still shapes the Redis key (see "rule scoping"),
      // but anything outside the UserTier enum is persisted as null, so the
      // analytics view cannot see it.
      expect(ctx.prisma.requestLogs[0].userTier).toBeNull();
    });
  });
});

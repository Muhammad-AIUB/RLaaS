/**
 * POST /api/v1/gateway/demo-check — characterization.
 *
 * The public, unauthenticated demo endpoint behind the marketing "gateway
 * tester" page. Limit and window are compile-time constants in the controller
 * (5 requests / 10 seconds), not configuration.
 *
 * Redis is real, so the demo counters and their TTLs are the live ones.
 */

import request from 'supertest';
import {
  CharacterizationContext,
  createCharacterizationApp,
} from './support/test-app';

describe('POST /api/v1/gateway/demo-check', () => {
  let ctx: CharacterizationContext;

  const post = (body: object) =>
    request(ctx.app.getHttpServer()).post('/api/v1/gateway/demo-check').send(body);

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
    // 30/min per IP on this route (DemoThrottlerGuard), and every test comes
    // from 127.0.0.1, so a spent budget must not leak into the next test.
    ctx.resetThrottle();
  });

  it('answers 200 with the demo envelope and no authentication at all', async () => {
    const response = await post({
      algorithm: 'fixed_window',
      identifier: 'demo_session_a',
    });

    // WAS KNOWN-ODD, NOW FIXED: 201 Created for a read-only rate-limit probe.
    // The route now sets @HttpCode(200), and the envelope matches /check's:
    // `retryAfter` in seconds replaced `resetInMs` / `retryAfterMs`.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      allowed: true,
      algorithm: 'fixed_window',
      limit: 5,
      remaining: 4,
      retryAfter: 0,
      timestamp: expect.any(String),
    });
  });

  it('allows exactly five requests, then blocks', async () => {
    const identifier = 'demo_session_b';
    const results: Array<{ allowed: boolean; remaining: number }> = [];

    for (let index = 0; index < 6; index += 1) {
      const response = await post({ algorithm: 'fixed_window', identifier });
      results.push({
        allowed: response.body.allowed,
        remaining: response.body.remaining,
      });
    }

    expect(results).toEqual([
      { allowed: true, remaining: 4 },
      { allowed: true, remaining: 3 },
      { allowed: true, remaining: 2 },
      { allowed: true, remaining: 1 },
      { allowed: true, remaining: 0 },
      { allowed: false, remaining: 0 },
    ]);
  });

  it('answers a block with 429, the decision body and Retry-After', async () => {
    const identifier = 'demo_session_c';

    for (let index = 0; index < 5; index += 1) {
      await post({ algorithm: 'fixed_window', identifier });
    }

    const blocked = await post({ algorithm: 'fixed_window', identifier });

    // WAS KNOWN-ODD: `resetInMs` was always 0 while allowed, so a client could
    // not show a countdown until it had been rejected. The field is gone; a
    // block now carries `retryAfter` (seconds) in the body and the header, and
    // an allowed answer still has no reset time (retryAfter: 0).
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      allowed: false,
      reason: 'RATE_LIMIT_EXCEEDED',
      algorithm: 'fixed_window',
      limit: 5,
      remaining: 0,
    });
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
    expect(blocked.body.retryAfter).toBeLessThanOrEqual(10);
    expect(blocked.headers['retry-after']).toBe(String(blocked.body.retryAfter));
  });

  it('throttles one IP to 30 probes a minute, before running the check', async () => {
    const statuses: number[] = [];

    // Fresh identifier each time, so the demo's own 5-per-10s limit never
    // fires and every 429 here is the per-IP throttle.
    for (let index = 0; index < 31; index += 1) {
      const response = await post({
        algorithm: 'fixed_window',
        identifier: `demo_flood_${index}`,
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);

    const throttled = await post({ algorithm: 'fixed_window', identifier: 'demo_flood_x' });
    // The throttler answers before the handler runs: standard error envelope,
    // no decision body, and no Redis key minted for the identifier.
    expect(throttled.status).toBe(429);
    expect(throttled.body.allowed).toBeUndefined();
    expect(throttled.body.success).toBe(false);
    expect(await ctx.redis.exists('demo:demo_flood_x:fixed_window')).toBe(0);
  });

  it('creates one unbounded Redis key per caller-supplied identifier', async () => {
    await post({ algorithm: 'fixed_window', identifier: 'demo_one' });
    await post({ algorithm: 'fixed_window', identifier: 'demo_two' });
    await post({ algorithm: 'token_bucket', identifier: 'demo_one' });

    const keys = (await ctx.redis.keys('demo:*')).sort();

    // KNOWN-ODD: `identifier` comes straight from the request body on an
    // unauthenticated endpoint, so any caller can mint a Redis key (and a
    // fresh quota) just by changing the string. The per-IP throttle now caps
    // that at 30 keys a minute per address, not unlimited.
    expect(keys).toEqual([
      'demo:demo_one:fixed_window',
      'demo:demo_one:token_bucket',
      'demo:demo_two:fixed_window',
    ]);

    const ttl = await ctx.redis.pttl('demo:demo_one:fixed_window');
    expect(ttl).toBeGreaterThan(8_000);
    expect(ttl).toBeLessThanOrEqual(10_000);
  });

  it('keeps a separate quota per algorithm for the same identifier', async () => {
    const identifier = 'demo_session_d';

    for (let index = 0; index < 5; index += 1) {
      await post({ algorithm: 'fixed_window', identifier });
    }

    const blockedOnFixed = await post({ algorithm: 'fixed_window', identifier });
    const allowedOnBucket = await post({ algorithm: 'token_bucket', identifier });

    expect(blockedOnFixed.body.allowed).toBe(false);
    expect(allowedOnBucket.body.allowed).toBe(true);
  });

  it('rejects an unknown algorithm', async () => {
    const response = await post({
      algorithm: 'leaky_bucket',
      identifier: 'demo_session_e',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: [
          'algorithm must be one of the following values: fixed_window, sliding_window_log, sliding_window_counter, token_bucket',
        ],
        statusCode: 400,
        path: '/api/v1/gateway/demo-check',
        timestamp: expect.any(String),
      },
    });
  });

  it('rejects an identifier outside the allowed character set', async () => {
    const response = await post({
      algorithm: 'fixed_window',
      identifier: 'demo:session:f',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toEqual([
      'identifier must contain only letters, numbers, underscores, or hyphens',
    ]);
  });
});

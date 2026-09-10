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
  });

  it('answers 201 with the demo envelope and no authentication at all', async () => {
    const response = await post({
      algorithm: 'fixed_window',
      identifier: 'demo_session_a',
    });

    // KNOWN-ODD: 201 Created for a read-only rate-limit probe (Nest's default
    // POST status is never overridden).
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      allowed: true,
      algorithm: 'fixed_window',
      limit: 5,
      remaining: 4,
      resetInMs: 0,
      retryAfterMs: null,
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

  it('reports resetInMs only once the caller is already blocked', async () => {
    const identifier = 'demo_session_c';

    for (let index = 0; index < 5; index += 1) {
      await post({ algorithm: 'fixed_window', identifier });
    }

    const blocked = await post({ algorithm: 'fixed_window', identifier });

    // KNOWN-ODD: `resetInMs` is derived from `retryAfter`, which is 0 whenever
    // the request is allowed. A client cannot show a countdown until it has
    // already been rejected.
    expect(blocked.body.allowed).toBe(false);
    expect(blocked.body.resetInMs).toBeGreaterThan(0);
    expect(blocked.body.resetInMs).toBeLessThanOrEqual(10_000);
    expect(blocked.body.retryAfterMs).toBe(blocked.body.resetInMs);
  });

  it('creates one unbounded Redis key per caller-supplied identifier', async () => {
    await post({ algorithm: 'fixed_window', identifier: 'demo_one' });
    await post({ algorithm: 'fixed_window', identifier: 'demo_two' });
    await post({ algorithm: 'token_bucket', identifier: 'demo_one' });

    const keys = (await ctx.redis.keys('demo:*')).sort();

    // KNOWN-ODD: `identifier` comes straight from the request body on an
    // unauthenticated endpoint, so any caller can mint unlimited Redis keys
    // (and a fresh quota) just by changing the string.
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

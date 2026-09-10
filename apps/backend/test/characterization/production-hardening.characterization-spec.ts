/**
 * Regression tests for defects found by driving the live API end to end.
 *
 * Unlike the neighbouring characterization specs, these do NOT record current
 * behaviour — every test here failed before the fix it guards. Each one names
 * the defect it pins down so a future change that reintroduces it fails loudly
 * rather than silently.
 *
 * Redis is real (index 15). Postgres is the in-memory double, so anything that
 * depends on real column types is asserted at the HTTP boundary instead.
 */

import { ApiKeyStatus } from '@prisma/client';
import request from 'supertest';
import {
  CharacterizationContext,
  createCharacterizationApp,
  flushDeferredWork,
  hashApiKey,
  signAccessToken,
} from './support/test-app';

const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
const API_KEY_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '66666666-6666-4666-8666-666666666666';
const RULE_ID = '77777777-7777-4777-8777-777777777777';
const RAW_KEY = 'rlaas_live_hardening_key';

describe('production hardening regressions', () => {
  let ctx: CharacterizationContext;
  let token: string;

  const post = (body: object) =>
    request(ctx.app.getHttpServer()).post('/api/v1/gateway/check').send(body);

  const check = (overrides: Record<string, unknown> = {}) =>
    post({
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
      name: 'Hardening key',
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
    ctx.prisma.rules.push({
      id: RULE_ID,
      projectId: PROJECT_ID,
      name: 'Five per five minutes',
      description: null,
      priority: 1,
      scope: 'GLOBAL',
      targetValue: null,
      endpointPattern: null,
      method: null,
      userTier: null,
      algorithm: 'FIXED_WINDOW',
      limit: 5,
      windowSeconds: 300,
      burstCapacity: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    });
  };

  const seedProjectAndUser = () => {
    ctx.prisma.projects.push({
      id: PROJECT_ID,
      ownerId: USER_ID,
      name: 'Hardening',
      slug: 'hardening',
      description: null,
      environment: 'production',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    ctx.prisma.members.push({
      id: '88888888-8888-4888-8888-888888888888',
      projectId: PROJECT_ID,
      userId: USER_ID,
      role: 'OWNER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  };

  beforeAll(async () => {
    ctx = await createCharacterizationApp();
    token = signAccessToken(ctx.jwt, { id: USER_ID, email: 'owner@rlaas.test' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    ctx.prisma.reset();
    await ctx.redis.flushdb();
  });

  /**
   * DEFECT: buildRateLimitKey appended the request's method, endpoint and
   * userTier to EVERY key regardless of the rule's scope. A rule declaring
   * "GLOBAL, 5 per 300s" therefore issued a fresh budget of 5 for each
   * (method, endpoint, tier) tuple the caller chose to send — all three of
   * which are caller-controlled. Measured against the live server before the
   * fix: 18 of 19 requests allowed against a limit of 5.
   */
  describe('a rule limits what it matches (scope key dilution)', () => {
    it('spends one shared budget across every endpoint a GLOBAL rule matches', async () => {
      seedApiKey();
      seedRule();

      const allowed: boolean[] = [];
      for (const endpoint of ['/a', '/b', '/c', '/d', '/e', '/f', '/g']) {
        allowed.push((await check({ endpoint })).body.allowed);
      }

      expect(allowed.filter(Boolean)).toHaveLength(5);
    });

    it('spends one shared budget across every method a GLOBAL rule matches', async () => {
      seedApiKey();
      seedRule();

      const allowed: boolean[] = [];
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
        allowed.push((await check({ method })).body.allowed);
      }

      expect(allowed.filter(Boolean)).toHaveLength(5);
    });

    it('spends one shared budget across every user tier a GLOBAL rule matches', async () => {
      seedApiKey();
      seedRule();

      const allowed: boolean[] = [];
      for (const userTier of ['free', 'pro', 'business', 'enterprise', 'free', 'pro']) {
        allowed.push((await check({ userTier })).body.allowed);
      }

      expect(allowed.filter(Boolean)).toHaveLength(5);
    });

    it('keeps one counter per rule instead of one per request shape', async () => {
      seedApiKey();
      seedRule();

      for (const endpoint of ['/a', '/b', '/c']) {
        await check({ endpoint, method: 'POST', userTier: 'pro' });
      }

      const keys = await ctx.redis.keys('rlaas:*');
      const counters = keys.filter((key) => !key.includes(':idempotency:'));

      expect(counters).toHaveLength(1);
    });

    it('gives an IP-scoped rule one budget per IP, not per IP and endpoint', async () => {
      seedApiKey();
      seedRule({ scope: 'IP', targetValue: '203.0.113.10', limit: 3 });

      const allowed: boolean[] = [];
      for (const endpoint of ['/a', '/b', '/c', '/d', '/e']) {
        allowed.push((await check({ endpoint })).body.allowed);
      }

      expect(allowed.filter(Boolean)).toHaveLength(3);
    });
  });

  /**
   * DEFECT: the API_KEY scope value was the raw API key, so the customer's
   * live credential appeared verbatim in the Redis key name — visible to
   * KEYS/SCAN/MONITOR, SLOWLOG, RDB dumps and any metrics exporter that
   * labels by key. The database only ever stores its HMAC.
   */
  it('never writes a raw API key into the Redis keyspace', async () => {
    seedApiKey();
    seedRule({ scope: 'API_KEY', targetValue: RAW_KEY, limit: 5 });

    await check();

    const keys = await ctx.redis.keys('*');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.join('\n')).not.toContain(RAW_KEY);
  });

  /**
   * DEFECT: GatewayCheckDto accepted any string as `method`. The decision was
   * served, then the request log write threw PrismaClientValidationError
   * ("Invalid value for argument `method`") and was swallowed by the deferred
   * error handler. Traffic with a non-standard method was rate limited but
   * left no trace in analytics, in lastUsedAt, or in the blocked-spike counts
   * the webhook alerts are built on.
   */
  describe('unsupported HTTP methods', () => {
    it('rejects a method the request log cannot store', async () => {
      seedApiKey();
      seedRule();

      const response = await check({ method: 'BREW' });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('method');
    });

    it('still records a request log for every method it does accept', async () => {
      seedApiKey();
      seedRule();

      await check({ method: 'HEAD' });
      await flushDeferredWork();

      expect(ctx.prisma.requestLogs).toHaveLength(1);
      expect(ctx.prisma.requestLogs[0]).toMatchObject({ method: 'HEAD' });
    });
  });

  /**
   * DEFECT: every project-scoped route passed the raw path parameter to
   * Prisma, where the column is `@db.Uuid`. A non-UUID id raised
   * PrismaClientKnownRequestError, which is not an HttpException, so the
   * global filter turned it into a bare 500. The dashboard rendered
   * "Something went wrong — Internal server error" for a mistyped URL.
   */
  describe('malformed project id', () => {
    const routes = [
      '/api/v1/projects/not-a-uuid',
      '/api/v1/projects/not-a-uuid/rules',
      '/api/v1/projects/not-a-uuid/api-keys',
      '/api/v1/projects/not-a-uuid/analytics/overview',
      '/api/v1/projects/not-a-uuid/audit-logs',
      '/api/v1/projects/not-a-uuid/webhooks',
      '/api/v1/projects/not-a-uuid/members',
    ];

    it.each(routes)('answers 400, never 500, for %s', async (route) => {
      const response = await request(ctx.app.getHttpServer())
        .get(route)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    it('still answers 404 for a well-formed id that does not exist', async () => {
      const response = await request(ctx.app.getHttpServer())
        .get('/api/v1/projects/99999999-9999-4999-8999-999999999999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  /**
   * DEFECT: ApiKeysService.create spread the whole row into its response, so
   * `hashedKey` — the stored credential digest — was returned to the browser.
   * The list endpoint already excluded it with an explicit column list.
   */
  it('never returns the stored key digest when issuing an API key', async () => {
    seedProjectAndUser();

    const response = await request(ctx.app.getHttpServer())
      .post(`/api/v1/projects/${PROJECT_ID}/api-keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'issued' });

    expect(response.status).toBe(201);
    expect(response.body.key).toEqual(expect.stringContaining('rlaas_live_'));
    expect(response.body).not.toHaveProperty('hashedKey');
  });

  /**
   * DEFECT: UpdateRuleDto is PartialType(CreateRuleDto) and `isActive` was on
   * neither, so `PATCH { isActive: false }` came back 400 "property isActive
   * should not exist" under forbidNonWhitelisted. The column exists,
   * findMatchingRule filters on it, and the dashboard renders a Pause button
   * that sends exactly that request — so pausing a rule was impossible and the
   * only way to stop one was to delete it.
   */
  describe('pausing a rule', () => {
    it('accepts PATCH { isActive: false }', async () => {
      seedProjectAndUser();
      seedRule();

      const response = await request(ctx.app.getHttpServer())
        .patch(`/api/v1/projects/${PROJECT_ID}/rules/${RULE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ isActive: false });
    });

    it('stops applying a paused rule to gateway traffic', async () => {
      seedProjectAndUser();
      seedApiKey();
      seedRule();

      expect((await check()).body.limit).toBe(5);

      await request(ctx.app.getHttpServer())
        .patch(`/api/v1/projects/${PROJECT_ID}/rules/${RULE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: false });

      // The default rule takes over, not a stale cached copy of the paused one.
      const after = await check();
      expect(after.body.ruleName).toBe('Default global rule');
      expect(after.body.limit).toBe(100);
    });
  });

  /**
   * DEFECT: webhook URLs were validated with IsUrl({ require_tld: false }),
   * which accepts loopback, link-local and private addresses. The server
   * POSTs to that URL from inside its own network, so a project admin could
   * aim it at the cloud metadata service or at the platform's own Redis.
   */
  describe('webhook destination', () => {
    const blocked = [
      'not-a-url',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://127.0.0.1:6379/',
      'http://localhost:3000/api/v1/health',
      'http://[::1]:8080/',
      'http://10.0.0.5/internal',
      'http://192.168.1.1/admin',
      'ftp://files.example.com/a',
    ];

    it.each(blocked)('refuses %s', async (url) => {
      seedProjectAndUser();

      const response = await request(ctx.app.getHttpServer())
        .post(`/api/v1/projects/${PROJECT_ID}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'probe', url });

      expect(response.status).toBe(400);
    });

    it('still accepts an ordinary public https endpoint', async () => {
      seedProjectAndUser();

      const response = await request(ctx.app.getHttpServer())
        .post(`/api/v1/projects/${PROJECT_ID}/webhooks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ops', url: 'https://hooks.example.com/rlaas' });

      expect(response.status).toBe(201);
    });
  });
});

/**
 * /api/v1/projects/:projectId/rules — characterization.
 *
 * The policy surface of the rate limiter: what can be created, who may do it,
 * and what comes back. Authorization, validation and the Redis caching layer
 * are all real; only the Postgres rows are served from the in-memory double,
 * so assertions here stay on the fields the service itself controls rather
 * than on driver-level serialisation.
 */

import request from 'supertest';
import {
  CharacterizationContext,
  createCharacterizationApp,
  flushDeferredWork,
} from './support/test-app';

const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_ID = '55555555-5555-4555-8555-555555555555';
const VIEWER_ID = '66666666-6666-4666-8666-666666666666';
const STRANGER_ID = '77777777-7777-4777-8777-777777777777';

const VALID_RULE = {
  name: 'Free tier global protection',
  priority: 100,
  scope: 'GLOBAL',
  algorithm: 'FIXED_WINDOW',
  limit: 1000,
  windowSeconds: 60,
};

describe('/api/v1/projects/:projectId/rules', () => {
  let ctx: CharacterizationContext;
  let ownerToken: string;
  let viewerToken: string;
  let strangerToken: string;

  const base = `/api/v1/projects/${PROJECT_ID}/rules`;

  const asUser = (token: string) => ({
    post: (path: string, body?: unknown) =>
      request(ctx.app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    get: (path: string) =>
      request(ctx.app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`),
    patch: (path: string, body?: unknown) =>
      request(ctx.app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    delete: (path: string) =>
      request(ctx.app.getHttpServer())
        .delete(path)
        .set('Authorization', `Bearer ${token}`),
  });

  const seedRule = (overrides: Record<string, unknown> = {}) => {
    const rule = {
      id: '88888888-8888-4888-8888-888888888888',
      projectId: PROJECT_ID,
      name: 'Existing rule',
      description: null,
      priority: 10,
      scope: 'GLOBAL',
      targetValue: null,
      endpointPattern: null,
      method: null,
      userTier: null,
      algorithm: 'FIXED_WINDOW',
      limit: 50,
      windowSeconds: 60,
      burstCapacity: null,
      isActive: true,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      ...overrides,
    };
    ctx.prisma.rules.push(rule);
    return rule;
  };

  beforeAll(async () => {
    ctx = await createCharacterizationApp();
    ownerToken = ctx.jwt.sign({ sub: OWNER_ID, email: 'owner@rlaas.test', tier: 'PRO' });
    viewerToken = ctx.jwt.sign({ sub: VIEWER_ID, email: 'viewer@rlaas.test', tier: 'FREE' });
    strangerToken = ctx.jwt.sign({ sub: STRANGER_ID, email: 'nobody@rlaas.test', tier: 'FREE' });
  });

  afterAll(async () => {
    await ctx.redis.flushdb();
    await ctx.close();
  });

  beforeEach(async () => {
    ctx.prisma.reset();
    await ctx.redis.flushdb();
    ctx.prisma.members.push(
      { projectId: PROJECT_ID, userId: OWNER_ID, role: 'OWNER' },
      { projectId: PROJECT_ID, userId: VIEWER_ID, role: 'VIEWER' },
    );
  });

  describe('POST / (create)', () => {
    it('creates a rule for an OWNER and answers 201', async () => {
      const response = await asUser(ownerToken).post(base, VALID_RULE);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        projectId: PROJECT_ID,
        name: 'Free tier global protection',
        priority: 100,
        scope: 'GLOBAL',
        algorithm: 'FIXED_WINDOW',
        limit: 1000,
        windowSeconds: 60,
        isActive: true,
      });
      expect(response.body.id).toEqual(expect.any(String));
      expect(ctx.prisma.rules).toHaveLength(1);
    });

    it('refuses a VIEWER with 403 and the standard envelope', async () => {
      const response = await asUser(viewerToken).post(base, VALID_RULE);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'You do not have access to this project action',
          statusCode: 403,
          path: base,
          timestamp: expect.any(String),
        },
      });
    });

    it('tells a non-member the project does not exist', async () => {
      const response = await asUser(strangerToken).post(base, VALID_RULE);

      // Deliberate: membership is the only lookup, so a real-but-inaccessible
      // project is indistinguishable from a missing one. Recorded as-is.
      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Project not found');
    });

    it('rejects an unauthenticated caller with 401', async () => {
      const response = await request(ctx.app.getHttpServer())
        .post(base)
        .send(VALID_RULE);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Unauthorized',
          statusCode: 401,
          path: base,
          timestamp: expect.any(String),
        },
      });
    });

    it('validates the payload before any authorization check runs', async () => {
      const response = await asUser(strangerToken).post(base, {
        ...VALID_RULE,
        limit: 0,
      });

      // KNOWN-ODD: the ValidationPipe runs ahead of the guard's project check,
      // so a non-member learns whether their payload is well formed. Low
      // impact, but it is the current ordering.
      expect(response.status).toBe(400);
      expect(response.body.error.message).toEqual(['limit must not be less than 1']);
    });

    it('records an audit entry after the response, not before', async () => {
      await asUser(ownerToken).post(base, VALID_RULE);
      await flushDeferredWork();

      expect(ctx.prisma.auditLogs).toHaveLength(1);
      expect(ctx.prisma.auditLogs[0]).toMatchObject({
        action: 'rule.created',
        actorId: OWNER_ID,
        projectId: PROJECT_ID,
        resourceType: 'rate_limit_rule',
      });
    });

    it('drops the cached rule list so the gateway picks the rule up', async () => {
      seedRule();
      await asUser(ownerToken).get(base);
      expect(await ctx.redis.exists(`cache:rules:project:${PROJECT_ID}`)).toBe(1);

      await asUser(ownerToken).post(base, VALID_RULE);

      expect(await ctx.redis.exists(`cache:rules:project:${PROJECT_ID}`)).toBe(0);
    });
  });

  describe('GET / (list)', () => {
    it('returns the project rules ordered by priority', async () => {
      seedRule({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', priority: 30, name: 'Third' });
      seedRule({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', priority: 10, name: 'First' });
      seedRule({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', priority: 20, name: 'Second' });

      const response = await asUser(ownerToken).get(base);

      expect(response.status).toBe(200);
      expect(response.body.map((rule: { name: string }) => rule.name)).toEqual([
        'First',
        'Second',
        'Third',
      ]);
    });

    it('refuses a NON-MEMBER even once a member has warmed the cache', async () => {
      seedRule({ name: 'Sensitive policy' });

      const asMember = await asUser(ownerToken).get(base);
      expect(asMember.status).toBe(200);

      const asOutsider = await asUser(strangerToken).get(base);

      // listByProject used to read the Redis cache *before* calling
      // assertProjectAccess, and the cache key is scoped to the project rather
      // than the caller — so any authenticated user read another project's
      // rules for the 60s lifetime of the entry (C3). The same shape existed on
      // the API-key list and all four analytics endpoints; all six now
      // authorize first.
      expect(asOutsider.status).toBe(404);
      expect(asOutsider.body.error.message).toBe('Project not found');

      // The entry is warm, so this is authorization talking, not a cache miss:
      expect(await ctx.redis.exists(`cache:rules:project:${PROJECT_ID}`)).toBe(1);
      expect(
        ctx.prisma.members.find((member) => member.userId === STRANGER_ID),
      ).toBeUndefined();
    });

    it('refuses the non-member when the cache is cold', async () => {
      seedRule();

      const response = await asUser(strangerToken).get(base);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Project not found');
    });

    it('lets a VIEWER read the list', async () => {
      seedRule();

      const response = await asUser(viewerToken).get(base);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });
  });

  describe('PATCH /:ruleId and DELETE /:ruleId', () => {
    it('updates a rule and returns the new row', async () => {
      const rule = seedRule();

      const response = await asUser(ownerToken).patch(`${base}/${rule.id}`, {
        limit: 99,
        windowSeconds: 120,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: rule.id,
        limit: 99,
        windowSeconds: 120,
      });
    });

    // WAS KNOWN-ODD — BROKEN FEATURE, NOW FIXED. UpdateRuleDto is
    // PartialType(CreateRuleDto) and CreateRuleDto had no `isActive` member,
    // so `forbidNonWhitelisted` rejected it. The dashboard's Pause control
    // posts exactly this body (apps/frontend/app/(app)/projects/[projectId]/
    // rules/page.tsx), so it always failed with "Failed to toggle rule" — a
    // rule could be created active and never turned off through the UI.
    it('accepts `isActive`, which is the field the dashboard toggle sends', async () => {
      const rule = seedRule({ isActive: true });

      const response = await asUser(ownerToken).patch(`${base}/${rule.id}`, {
        isActive: false,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ isActive: false });
      expect(ctx.prisma.rules[0].isActive).toBe(false);
    });

    it('answers 404 for a rule that belongs to another project', async () => {
      const rule = seedRule({ projectId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });

      const response = await asUser(ownerToken).patch(`${base}/${rule.id}`, {
        limit: 5,
      });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Rule not found');
    });

    it('deletes a rule and returns a bare success flag', async () => {
      const rule = seedRule();

      const response = await asUser(ownerToken).delete(`${base}/${rule.id}`);

      // KNOWN-ODD: every other endpoint returns the resource; delete returns
      // `{ success: true }`, which is also the only place the success envelope
      // appears on a 2xx.
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(ctx.prisma.rules).toHaveLength(0);
    });

    it('refuses a VIEWER on delete', async () => {
      const rule = seedRule();

      const response = await asUser(viewerToken).delete(`${base}/${rule.id}`);

      expect(response.status).toBe(403);
      expect(ctx.prisma.rules).toHaveLength(1);
    });
  });

  describe('POST /simulate', () => {
    const simulationBody = (overrides: Record<string, unknown> = {}) => ({
      rule: { ...VALID_RULE, limit: 2, ...overrides },
      request: {
        apiKey: 'rlaas_live_simulation',
        ip: '198.51.100.10',
        endpoint: '/api/orders',
        method: 'GET',
        userTier: 'free',
      },
      requestCount: 3,
    });

    it('consumes an isolated counter and returns the last decision', async () => {
      const response = await asUser(ownerToken).post(`${base}/simulate`, simulationBody());

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        matches: true,
        simulatedRequests: 3,
        result: {
          allowed: false,
          limit: 2,
          remaining: 0,
          algorithm: 'fixed_window',
        },
        rule: {
          name: 'Free tier global protection',
          scope: 'GLOBAL',
          algorithm: 'fixed_window',
          limit: 2,
          windowSeconds: 60,
        },
      });
      expect(response.body.simulationKey).toMatch(
        new RegExp(`^rlaas:simulation:${PROJECT_ID}:`),
      );
    });

    it('leaves a fresh throwaway key in Redis on every call', async () => {
      await asUser(ownerToken).post(`${base}/simulate`, simulationBody());
      await asUser(ownerToken).post(`${base}/simulate`, simulationBody());

      // KNOWN-ODD: the simulation key embeds a randomUUID, so two identical
      // simulations never share a counter — and each one leaves a key behind
      // for the whole window.
      expect(await ctx.redis.keys('rlaas:simulation:*')).toHaveLength(2);
    });

    it('reports a non-matching rule without consuming anything', async () => {
      const response = await asUser(ownerToken).post(`${base}/simulate`, {
        ...simulationBody(),
        rule: {
          ...VALID_RULE,
          scope: 'IP',
          targetValue: '203.0.113.99',
        },
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        matches: false,
        reason: 'RULE_DOES_NOT_MATCH_REQUEST',
      });
      expect(await ctx.redis.keys('rlaas:simulation:*')).toHaveLength(0);
    });

    it('caps requestCount at 1000', async () => {
      const response = await asUser(ownerToken).post(`${base}/simulate`, {
        ...simulationBody(),
        requestCount: 1001,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toEqual([
        'requestCount must not be greater than 1000',
      ]);
    });
  });
});

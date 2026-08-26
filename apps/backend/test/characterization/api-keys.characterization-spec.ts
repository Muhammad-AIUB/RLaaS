/**
 * /api/v1/projects/:projectId/api-keys — characterization.
 *
 * API keys are the subject a rate limit is applied to, so their lifecycle is
 * part of the limiter's contract: what a freshly minted key looks like, what
 * the list endpoint discloses, and how quickly a revoked key stops being
 * honoured at the gateway.
 *
 * Redis is real, which is what makes the revocation test meaningful — it goes
 * through the same 30-second key cache production uses.
 */

import { ApiKeyStatus } from '@prisma/client';
import request from 'supertest';
import {
  CharacterizationContext,
  createCharacterizationApp,
  flushDeferredWork,
  hashApiKey,
} from './support/test-app';

const PROJECT_ID = '99999999-9999-4999-8999-999999999999';
const OWNER_ID = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIEWER_ID = 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER_ID = 'cccc3333-cccc-4ccc-8ccc-cccccccccccc';

describe('/api/v1/projects/:projectId/api-keys', () => {
  let ctx: CharacterizationContext;
  let ownerToken: string;
  let viewerToken: string;
  let strangerToken: string;

  const base = `/api/v1/projects/${PROJECT_ID}/api-keys`;

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
  });

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
    it('returns the plaintext key exactly once, alongside its stored hash', async () => {
      const response = await asUser(ownerToken).post(base, { name: 'Primary key' });

      expect(response.status).toBe(201);
      expect(response.body.key).toMatch(/^rlaas_live_[0-9a-f]{48}$/);
      expect(response.body.keyPrefix).toBe(response.body.key.slice(0, 18));
      expect(response.body).toMatchObject({
        projectId: PROJECT_ID,
        name: 'Primary key',
        status: ApiKeyStatus.ACTIVE,
        hashVersion: 'hmac-sha256-v1',
        expiresAt: null,
        lastUsedAt: null,
      });

      // KNOWN-ODD: the create response also carries `hashedKey`, the stored
      // credential digest. Nothing in the client needs it, and it is the value
      // an attacker would want in order to forge a cache entry.
      expect(response.body.hashedKey).toBe(hashApiKey(response.body.key));
    });

    it('refuses a VIEWER with 403', async () => {
      const response = await asUser(viewerToken).post(base, { name: 'Nope' });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toBe(
        'You do not have access to this project action',
      );
    });

    it('rejects an unauthenticated caller with 401', async () => {
      const response = await request(ctx.app.getHttpServer())
        .post(base)
        .send({ name: 'Nope' });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Unauthorized');
    });
  });

  describe('GET / (list)', () => {
    it('lets a VIEWER read every key hash in the project', async () => {
      await asUser(ownerToken).post(base, { name: 'Primary key' });

      const response = await asUser(viewerToken).get(base);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);

      // KNOWN-ODD: the list returns whole rows, so `hashedKey` is disclosed to
      // every project member including read-only VIEWERs. The plaintext key is
      // not recoverable from it, but it is still the stored credential.
      expect(response.body[0].hashedKey).toEqual(expect.any(String));
      expect(response.body[0].key).toBeUndefined();
    });

    it('serves the cached key list — hashes included — to a NON-MEMBER', async () => {
      await asUser(ownerToken).post(base, { name: 'Primary key' });

      const asMember = await asUser(ownerToken).get(base);
      const asOutsider = await asUser(strangerToken).get(base);

      // KNOWN-ODD — SECURITY. listByProject reads `cache:apikeys:project:<id>`
      // before assertProjectAccess runs, and the key is not scoped to the
      // caller. Any authenticated user can read another project's API key rows,
      // hashes and all, for the 60s the entry lives. This is the same defect as
      // on the rules and analytics endpoints, but with the worst payload.
      expect(asOutsider.status).toBe(200);
      expect(asOutsider.body).toEqual(asMember.body);
      expect(asOutsider.body[0].hashedKey).toEqual(expect.any(String));
    });

    it('refuses the non-member when the cache is cold', async () => {
      await asUser(ownerToken).post(base, { name: 'Primary key' });
      await ctx.redis.del(`cache:apikeys:project:${PROJECT_ID}`);

      const response = await asUser(strangerToken).get(base);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Project not found');
    });
  });

  describe('PATCH /:apiKeyId/revoke', () => {
    it('marks the key revoked and stops the gateway honouring it', async () => {
      const created = await asUser(ownerToken).post(base, { name: 'Primary key' });
      const rawKey: string = created.body.key;
      const apiKeyId: string = created.body.id;

      const gatewayCheck = () =>
        request(ctx.app.getHttpServer())
          .post('/api/v1/gateway/check')
          .send({
            apiKey: rawKey,
            ip: '203.0.113.10',
            endpoint: '/api/products',
            method: 'GET',
            userTier: 'free',
          });

      const beforeRevoke = await gatewayCheck();
      expect(beforeRevoke.body.allowed).toBe(true);

      // The key is now warm in `cache:apikey:<hash>`.
      expect(await ctx.redis.exists(`cache:apikey:${hashApiKey(rawKey)}`)).toBe(1);

      const revoked = await asUser(ownerToken).patch(`${base}/${apiKeyId}/revoke`);
      expect(revoked.status).toBe(200);
      expect(revoked.body).toMatchObject({
        id: apiKeyId,
        status: ApiKeyStatus.REVOKED,
      });

      // revoke() busts the gateway cache with `void`, so the deletion is still
      // in flight when the HTTP response returns.
      await flushDeferredWork();
      expect(await ctx.redis.exists(`cache:apikey:${hashApiKey(rawKey)}`)).toBe(0);

      const afterRevoke = await gatewayCheck();
      expect(afterRevoke.body).toMatchObject({
        allowed: false,
        reason: 'API_KEY_REVOKED',
      });
    });

    it('answers 404 for a key belonging to another project', async () => {
      ctx.prisma.apiKeys.push({
        id: 'dddd4444-dddd-4ddd-8ddd-dddddddddddd',
        projectId: 'eeee5555-eeee-4eee-8eee-eeeeeeeeeeee',
        name: 'Someone else',
        keyPrefix: 'rlaas_live_other',
        hashedKey: hashApiKey('rlaas_live_other'),
        status: ApiKeyStatus.ACTIVE,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await asUser(ownerToken).patch(
        `${base}/dddd4444-dddd-4ddd-8ddd-dddddddddddd/revoke`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('API key not found');
    });

    it('refuses a VIEWER', async () => {
      const created = await asUser(ownerToken).post(base, { name: 'Primary key' });

      const response = await asUser(viewerToken).patch(
        `${base}/${created.body.id}/revoke`,
      );

      expect(response.status).toBe(403);
      expect(ctx.prisma.apiKeys[0].status).toBe(ApiKeyStatus.ACTIVE);
    });
  });
});

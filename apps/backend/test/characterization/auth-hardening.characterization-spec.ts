/**
 * Regression tests for the authentication hardening pass.
 *
 * Every test here failed before the fix it guards. The findings came from a
 * /cso security audit: the API had no throttle, no attempt counter and no
 * lockout anywhere, on a product whose entire purpose is rate limiting.
 *
 * Redis is real (index 15), so the throttle's storage and the reset-code
 * attempt counter are exercised against a live server rather than a mock.
 */

import request from 'supertest';
import {
  CharacterizationContext,
  createCharacterizationApp,
  flushDeferredWork,
  sleep,
} from './support/test-app';

/**
 * Waits for the fire-and-forget rehash to land.
 *
 * bcryptjs is pure JS, so a cost-12 hash costs hundreds of milliseconds and the
 * exact figure varies by machine. A fixed sleep here would be measuring the
 * machine; poll for the outcome and fail with a real value if it never arrives.
 */
async function waitForHashCost(
  read: () => string,
  expectedCost: string,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const cost = read().split('$')[2];
    if (cost === expectedCost) return cost;
    await sleep(50);
  }

  return read().split('$')[2];
}

const EMAIL = 'hardening@rlaas.test';
const PASSWORD = 'HardeningPass123!';

describe('auth hardening regressions', () => {
  let ctx: CharacterizationContext;

  const post = (path: string, body: object) =>
    request(ctx.app.getHttpServer()).post(`/api/v1/auth/${path}`).send(body);

  const registerUser = () =>
    post('register', { email: EMAIL, password: PASSWORD, fullName: 'Hardening' });

  beforeAll(async () => {
    ctx = await createCharacterizationApp();
  });

  afterAll(async () => {
    // Leave index 15 empty. globalSetup refuses to run against a non-empty
    // database, so a spec that leaves keys behind blocks the next whole run.
    await ctx.redis.flushdb();
    await ctx.close();
  });

  beforeEach(async () => {
    ctx.prisma.reset();
    await ctx.redis.flushdb();
    // The throttle counts in process memory, not Redis, so flushdb does not
    // clear it and a spent budget would leak into the next test.
    ctx.resetThrottle();
  });

  /**
   * DEFECT: @nestjs/throttler was not a dependency, and no guard, interceptor
   * or middleware counted attempts on any auth route. Unlimited credential
   * stuffing on /auth/login, and unlimited guesses at the reset code.
   */
  describe('per-IP throttle', () => {
    it('stops accepting attempts once the budget is spent', async () => {
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 14; attempt += 1) {
        const response = await post('login', {
          email: EMAIL,
          password: 'WrongPassword123!',
        });
        statuses.push(response.status);
      }

      // The budget is 10/minute. Before the fix every one of these was 401.
      expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
      expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
      expect(statuses[statuses.length - 1]).toBe(429);
    });

    it('meters each route on its own budget', async () => {
      for (let attempt = 0; attempt < 11; attempt += 1) {
        await post('login', { email: EMAIL, password: 'WrongPassword123!' });
      }

      // ThrottlerGuard keys on class + handler, so spending the login budget
      // leaves forgot-password with its own. That is the behaviour we want:
      // someone fumbling their password should not be locked out of the reset
      // flow. The guard sits on the controller so a route added later is
      // covered by default rather than being forgotten.
      const forgot = await post('forgot-password', { email: EMAIL });
      expect(forgot.status).toBe(201);
    });

    it('throttles the reset route independently, which is the brute-force path', async () => {
      await registerUser();
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await post('reset-password', {
          email: EMAIL,
          code: '000000',
          newPassword: 'AttackerPassword123!',
        });
        statuses.push(response.status);
      }

      // 900,000 codes against 10 guesses per minute per IP is roughly 170
      // years, before the five-strike code burn below is even considered.
      expect(statuses[statuses.length - 1]).toBe(429);
    });

    /**
     * The throttle is only as good as its key. ThrottlerGuard's default tracker
     * is req.ip, which Express derives from x-forwarded-for once `trust proxy`
     * is on — so a caller could rotate one header and get a fresh bucket per
     * request. AuthThrottlerGuard keys on the resolver instead, which ignores
     * the header at the default 0 trusted hops.
     */
    it('cannot be reset by rotating X-Forwarded-For', async () => {
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 14; attempt += 1) {
        const response = await request(ctx.app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', `10.0.0.${attempt}`)
          .send({ email: EMAIL, password: 'WrongPassword123!' });
        statuses.push(response.status);
      }

      expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
    });
  });

  /**
   * DEFECT: resetPassword compared a 6-digit code (900,000 values, 600s TTL)
   * and on mismatch threw without incrementing a counter and without deleting
   * the key. One issued code survived all 900,000 guesses, and re-requesting
   * simply rotated in a fresh target, so the attempt budget was unbounded.
   */
  describe('password reset code', () => {
    const seedLiveCode = async (code: string) => {
      await registerUser();
      await ctx.redis.setex(`pwd_reset:${EMAIL}`, 600, code);
    };

    it('is discarded after five wrong guesses', async () => {
      await seedLiveCode('123456');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await post('reset-password', {
          email: EMAIL,
          code: '000000',
          newPassword: 'AttackerPassword123!',
        });
        expect(response.status).toBe(400);
      }

      // Gone from Redis: even the correct code is now useless.
      expect(await ctx.redis.get(`pwd_reset:${EMAIL}`)).toBeNull();
    });

    it('rejects the real code once the budget is spent', async () => {
      await seedLiveCode('123456');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('reset-password', {
          email: EMAIL,
          code: '000000',
          newPassword: 'AttackerPassword123!',
        });
      }

      const withRealCode = await post('reset-password', {
        email: EMAIL,
        code: '123456',
        newPassword: 'AttackerPassword123!',
      });

      expect(withRealCode.status).toBe(400);
    });

    it('still accepts the real code inside the budget', async () => {
      await seedLiveCode('123456');

      await post('reset-password', {
        email: EMAIL,
        code: '999999',
        newPassword: 'NewPassword123!',
      });

      const accepted = await post('reset-password', {
        email: EMAIL,
        code: '123456',
        newPassword: 'NewPassword123!',
      });

      expect(accepted.status).toBe(201);
      expect(await ctx.redis.get(`pwd_reset:${EMAIL}`)).toBeNull();
      expect(await ctx.redis.get(`pwd_reset:${EMAIL}:attempts`)).toBeNull();
    });

    it('gives a newly requested code a fresh attempt budget', async () => {
      await registerUser();
      await ctx.redis.set(`pwd_reset:${EMAIL}:attempts`, '4');
      await ctx.redis.setex(`pwd_reset:${EMAIL}`, 600, '111111');

      // A carried-over counter would burn the new code on its first miss, and
      // the real owner would see a reset that silently stopped working.
      await post('forgot-password', { email: EMAIL });
      expect(await ctx.redis.get(`pwd_reset:${EMAIL}:attempts`)).toBeNull();
    });

    it('does not count guesses when no reset is in flight', async () => {
      await registerUser();

      await post('reset-password', {
        email: EMAIL,
        code: '000000',
        newPassword: 'AttackerPassword123!',
      });

      // No live code means nothing to protect, and an attempts key left behind
      // here would burn the owner's next genuine code early.
      expect(await ctx.redis.get(`pwd_reset:${EMAIL}:attempts`)).toBeNull();
    });
  });

  /**
   * DEFECT: auth.service.ts audited only successful logins, so a credential
   * stuffing run left no evidence at all — nothing to alert on, nothing to
   * reconstruct afterwards.
   */
  describe('failed login auditing', () => {
    it('records a wrong password against the real account', async () => {
      await registerUser();
      ctx.prisma.auditLogs.length = 0;

      await post('login', { email: EMAIL, password: 'WrongPassword123!' });
      await flushDeferredWork();

      const failure = ctx.prisma.auditLogs.find(
        (row) => row.action === 'auth.login_failed',
      );

      expect(failure).toBeDefined();
      expect(failure?.metadata).toMatchObject({ email: EMAIL, accountExists: true });
    });

    it('records an attempt on an address that does not exist', async () => {
      await post('login', { email: 'nobody@rlaas.test', password: 'Whatever123!' });
      await flushDeferredWork();

      const failure = ctx.prisma.auditLogs.find(
        (row) => row.action === 'auth.login_failed',
      );

      expect(failure).toBeDefined();
      // Distinguishable from a wrong password on a real account, so probing
      // and stuffing can be told apart when reading the trail.
      expect(failure?.metadata).toMatchObject({ accountExists: false });
      expect(failure?.actorId ?? null).toBeNull();
    });

    it('never writes the attempted password anywhere', async () => {
      await registerUser();
      ctx.prisma.auditLogs.length = 0;

      await post('login', { email: EMAIL, password: 'SuperSecret123!' });
      await flushDeferredWork();

      expect(JSON.stringify(ctx.prisma.auditLogs)).not.toContain('SuperSecret123!');
    });
  });

  /**
   * DEFECT: register answers 409 for an address that exists, while login and
   * forgot-password deliberately give identical answers either way. That 409
   * is the email oracle the reset-code brute force needs.
   *
   * It cannot be closed while register returns an access token: a uniform
   * response means nobody gets a token, which means email verification, which
   * this codebase has no transport for. So it is made expensive and visible
   * instead. These tests pin that decision so nobody "fixes" it with a fake
   * 201, which would tell a real user their account exists when it does not.
   */
  describe('registration email oracle', () => {
    it('still tells an honest caller the address is taken', async () => {
      await registerUser();

      const again = await registerUser();

      expect(again.status).toBe(409);
    });

    it('records the conflict so enumeration is not silent', async () => {
      await registerUser();
      ctx.prisma.auditLogs.length = 0;

      await registerUser();
      await flushDeferredWork();

      const conflict = ctx.prisma.auditLogs.find(
        (row) => row.action === 'auth.register_conflict',
      );

      expect(conflict).toBeDefined();
      expect(conflict?.metadata).toMatchObject({ email: EMAIL });
      // Not attributed to the account owner: the caller proved nothing about
      // owning the address, so this must not land on their timeline.
      expect(conflict?.actorId ?? null).toBeNull();
    });

    it('is metered far tighter than the other auth routes', async () => {
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await post('register', {
          email: `probe${attempt}@rlaas.test`,
          password: PASSWORD,
          fullName: 'Probe',
        });
        statuses.push(response.status);
      }

      // 10/hour rather than 10/minute: a 60x cut in enumeration throughput
      // that a person registering an account will never notice.
      expect(statuses[statuses.length - 1]).toBe(429);
    });
  });

  /**
   * DEFECT: hash(password, 8) is below current guidance (10-12) and roughly
   * 16x cheaper to attack offline than 12.
   */
  describe('password hashing cost', () => {
    it('writes new passwords at cost 12', async () => {
      await registerUser();

      const stored = ctx.prisma.users[0].passwordHash as string;
      expect(stored.split('$')[2]).toBe('12');
    });

    it('upgrades an older hash on the next successful login', async () => {
      await registerUser();

      // Simulate an account created before the change, at the old cost.
      const { hash } = await import('bcryptjs');
      ctx.prisma.users[0].passwordHash = await hash(PASSWORD, 8);
      expect((ctx.prisma.users[0].passwordHash as string).split('$')[2]).toBe('08');

      const login = await post('login', { email: EMAIL, password: PASSWORD });
      expect(login.status).toBe(201);

      // The rehash is fire-and-forget so the caller is not made to wait.
      const cost = await waitForHashCost(
        () => ctx.prisma.users[0].passwordHash as string,
        '12',
      );

      expect(cost).toBe('12');
    });

    it('leaves a login working after the upgrade', async () => {
      await registerUser();
      const { hash } = await import('bcryptjs');
      ctx.prisma.users[0].passwordHash = await hash(PASSWORD, 8);

      await post('login', { email: EMAIL, password: PASSWORD });
      await waitForHashCost(
        () => ctx.prisma.users[0].passwordHash as string,
        '12',
      );

      // Redis caches the user row, so a stale cache here would sign the user
      // out until the TTL expired.
      const again = await post('login', { email: EMAIL, password: PASSWORD });
      expect(again.status).toBe(201);
    });
  });
});

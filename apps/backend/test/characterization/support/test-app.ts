/**
 * Boots the real application for characterization tests.
 *
 * Everything is the production wiring except the Postgres client:
 *  - real Nest module graph (AppModule)
 *  - real global prefix, URI versioning, ValidationPipe and exception filter
 *  - real JwtAuthGuard / passport-jwt strategy
 *  - REAL Redis (index 15), so TTLs and Lua atomicity are genuinely exercised
 *  - FakePrisma in place of PrismaService (see fake-prisma.ts for why)
 *
 * KNOWN-ODD (harness, not product): `main.ts` does not export its bootstrap
 * configuration, so the global prefix / versioning / pipe / filter setup below
 * is a hand copy of it. If `main.ts` changes, this file must change with it or
 * the suite will characterize a configuration that is no longer deployed.
 */

import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { createHmac } from 'crypto';
import type Redis from 'ioredis';
import { AppModule } from '../../../src/app.module';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { RedisService } from '../../../src/redis/redis.service';
import { FakePrisma } from './fake-prisma';

export interface CharacterizationContext {
  app: INestApplication;
  prisma: FakePrisma;
  redis: Redis;
  jwt: JwtService;
  /**
   * Clears the auth throttle's counters.
   *
   * ThrottlerModule keeps them in process memory, not in Redis, so
   * `redis.flushdb()` does not touch them and a test that spends the budget
   * leaves every later test in the same minute answering 429. Call this in
   * beforeEach alongside the Redis flush.
   */
  resetThrottle: () => void;
  close: () => Promise<void>;
}

export async function createCharacterizationApp(): Promise<CharacterizationContext> {
  const prisma = new FakePrisma();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();

  // --- mirror of main.ts ---
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  // --- end mirror ---

  await app.init();

  const redis = app.get(RedisService).getClient();
  const jwt = app.get(JwtService);
  // `_storage` is a Map, not a plain object. Treating it as a record silently
  // does nothing, and the throttle then leaks a spent budget between tests.
  const throttlerStorage = app.get<{ _storage?: Map<string, unknown> }>(
    ThrottlerStorage,
    { strict: false },
  );

  return {
    app,
    prisma,
    redis,
    jwt,
    resetThrottle: () => {
      // Reaching into `_storage` on purpose: the interface exposes no clear().
      throttlerStorage?._storage?.clear();
    },
    close: async () => {
      await app.close();
    },
  };
}

/** Same HMAC the service uses to turn a raw key into its stored hash. */
export function hashApiKey(rawKey: string): string {
  const pepper =
    process.env.API_KEY_HASH_PEPPER || process.env.JWT_SECRET || 'change-me';
  return createHmac('sha256', pepper).update(rawKey).digest('hex');
}

/** A bearer token in the exact shape auth.service.ts issues. */
export function signAccessToken(
  jwt: JwtService,
  user: { id: string; email: string; tier?: string },
): string {
  return jwt.sign({
    sub: user.id,
    email: user.email,
    tier: user.tier ?? 'FREE',
  });
}

/**
 * The gateway persists request logs and fires webhook checks with `void`, so
 * they are still in flight when the HTTP response is written. Tests that
 * assert on those side effects have to let the microtask queue drain first.
 */
export function flushDeferredWork(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rebuilds the Redis key the limiter uses, so tests can inspect the real
 * counter and its real TTL. Mirrors RateLimiterService#buildRateLimitKey.
 *
 * The key no longer carries the request's method, endpoint or userTier. It
 * used to, which meant a rule's declared limit was silently multiplied by the
 * number of request shapes a caller chose to send — see the scope-dilution
 * tests in production-hardening.characterization-spec.ts. The counter is now
 * identified by the rule that produced it.
 */
export function rateLimitKey(parts: {
  projectId: string;
  algorithm: string;
  scope: string;
  scopeValue: string;
  ruleId?: string;
}): string {
  return [
    'rlaas',
    parts.projectId,
    parts.algorithm,
    parts.scope,
    parts.scopeValue,
    parts.ruleId ?? 'default',
  ].join(':');
}

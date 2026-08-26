/**
 * Runs BEFORE any module is imported (jest `setupFiles`).
 *
 * Pins every environment variable the characterization suite depends on, so
 * the recorded behaviour is a function of the code and not of whatever is in
 * `.env` on a given machine.
 *
 * Two of these are safety rails, not configuration:
 *
 *  - DATABASE_URL is pointed at a dead address. The real `.env` points at a
 *    hosted Neon database; nothing in this suite may ever reach it. Postgres
 *    is replaced by an in-memory double (see fake-prisma.ts), so no connection
 *    should be attempted at all — this makes that a hard guarantee.
 *
 *  - REDIS_URL selects database index 15. Redis itself is REAL (that is the
 *    point of this suite: real TTLs, real atomicity), but it runs against a
 *    dedicated index so a developer's working data in db0 is never touched.
 *
 * `@nestjs/config` loads `.env` without overwriting variables that are already
 * present in `process.env`, so everything assigned here wins.
 */

process.env.NODE_ENV = 'test';

process.env.DATABASE_URL =
  'postgresql://characterization:disabled@127.0.0.1:1/disabled';

process.env.REDIS_URL =
  process.env.CHARACTERIZATION_REDIS_URL ?? 'redis://127.0.0.1:6379/15';
delete process.env.REDIS_HOST;
delete process.env.REDIS_PORT;

process.env.JWT_SECRET = 'characterization-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.API_KEY_HASH_PEPPER = 'characterization-pepper';

// The gateway falls back to these when no rule matches. Pinned so the
// "no rules configured" tests assert against a known default.
process.env.RATE_LIMIT_DEFAULT_LIMIT = '100';
process.env.RATE_LIMIT_DEFAULT_WINDOW_SECONDS = '60';
process.env.RATE_LIMIT_DEFAULT_ALGORITHM = 'fixed_window';
process.env.IDEMPOTENCY_TTL_SECONDS = '300';
process.env.PRISMA_QUERY_DEBUG = 'false';

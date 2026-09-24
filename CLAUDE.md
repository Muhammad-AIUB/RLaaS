# CLAUDE.md

## Project Snapshot

RLaaS Platform — self-hostable rate-limiting-as-a-service. pnpm monorepo:

- `apps/backend` — NestJS API + gateway (Port 3000, Swagger at `/docs`, versioning at `/api/v1`)
- `apps/frontend` — Next.js operator dashboard (Port 3001), talks to backend via BFF proxy at `app/api/proxy/[...path]`
- `packages/shared-types` — TS contracts consumed by SDK and dashboard
- `packages/express-sdk` — Express middleware SDK
- `examples/express-demo` — reference protected Express app
- `tests/load` — k6 scripts, `benchmarks/` — algorithm benchmark

Hot path: `POST /api/v1/gateway/check` → `RateLimiterService` → rule match (cached in Redis) → `AlgorithmRegistryService` → Lua script in Redis. Decision is returned before the deferred request-log write completes.

## Commands

```bash
# install
pnpm install

# dev (separate terminals)
pnpm dev:backend        # nest start --watch on :3000
pnpm dev:frontend       # next dev on :3001
pnpm dev:express-demo   # examples/express-demo on :4000

# build (per package)
pnpm build:backend
pnpm build:frontend
pnpm build:shared-types
pnpm build:express-sdk
pnpm build:express-demo

# test
pnpm test               # unit + characterization, backend only
pnpm test:backend:unit           # jest --runInBand, src/**/*.spec.ts
pnpm test:backend:characterization # real Redis db15, real Nest app, FakePrisma

# prisma
pnpm --filter @rlaas/backend prisma:generate
pnpm --filter @rlaas/backend prisma:migrate:dev
pnpm --filter @rlaas/backend db:seed

# request_logs retention (35 days; also runs daily in-process + on overdue boot)
pnpm --filter @rlaas/backend retention:run -- --dry-run   # count only (needs pnpm build:backend)
pnpm --filter @rlaas/backend retention:run                # delete, batched, takes the same lock
pnpm --filter @rlaas/backend retention:verify             # read-only post-rollout checks, PASS/WARN/FAIL

# load + bench
pnpm loadtest:gateway          # k6 run tests/load/gateway-check.k6.js
pnpm benchmark:algorithms      # tsx benchmarks/algorithm-benchmark.ts

# lint
pnpm --filter @rlaas/backend lint
```

## Architecture & Conventions

- **Module layout** — each backend concern lives in its own folder under `apps/backend/src/<concern>/`: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`. Cross-cutting helpers go in `common/` (`decorators/`, `filters/`, `pipes/`, `middleware/`, `utils/`, `timing/`, `interfaces/`).
- **DTOs** — one per controller verb; `class-validator` decorators + `@ApiProperty` from `@nestjs/swagger`. `ValidationPipe` is global with `whitelist: true, forbidNonWhitelisted: true, transform: true`, so unknown fields are rejected, not ignored.
- **Versioning** — every controller is `@Controller({ path: '...', version: '1' })`. Path params use `UuidParam` pipe from `common/pipes/uuid-param.pipe.ts`; raw `@Param()` is a 500 risk.
- **AuthZ** — every protected controller does `@UseGuards(JwtAuthGuard)` and calls `projectsService.assertProjectAccess(user.sub, projectId, [...roles])` first, before any cache or Prisma read. Role sets live in `apps/backend/src/projects/projects.constants.ts` (`PROJECT_OWNER_ONLY_ROLES`, `PROJECT_WRITE_ROLES`, `PROJECT_READ_ROLES`). `@Public()` marks a route unauthenticated; the per-IP throttle is the only thing standing between an attacker and unlimited attempts.
- **Audit logs** — every write path in a controller/service calls `void this.auditService.log({...})` with `actorId`, `projectId`, `resourceType`, `resourceId`, `metadata`, `request`. Use `void`; failures are logged and swallowed in `AuditService`.
- **Deferred writes** — `RateLimiterService` and `WebhooksService` launch background work with `void promise.catch(logDeferredFailure)`. Node's default terminates on unhandled rejection; the `process.on('unhandledRejection', ...)` in `main.ts` is a backstop, not a substitute for catching at the call site.
- **Redis caching** — services cache via `RedisService.getClient()`. `try { ... } catch { /* non-critical */ }` is the convention for cache failures: a Redis outage degrades to slower Postgres, never a request error. Cache invalidation is `bustXxxCache()` called after every successful write; TTLs are backstops, not the primary invalidation path.
- **Client IP** — never read `x-forwarded-for` directly. Use `resolveClientIp(socketIp, header, trustedProxyHops)` from `common/utils/client-ip.util.ts`. Count from the right; `TRUSTED_PROXY_HOPS=0` (default) trusts nothing. Audit rows and rate-limit matches both flow through this util via the `RequestMeta` decorator.
- **Algorithms** — one service per algorithm under `apps/backend/src/algorithms/<name>/`, implementing `RateLimitAlgorithmHandler.consume({key, limit, windowSeconds, algorithm})`. The Lua script is a `const` at the top of the file. `AlgorithmRegistryService` is the single resolution point.
- **Env validation** — `apps/backend/src/config/env.validation.ts` is bound by `ConfigModule.forRoot({ validate: validateEnv })`. The backend refuses to start without `JWT_SECRET` and `API_KEY_HASH_PEPPER`. There are no fallbacks. `API_KEY_HASH_PEPPER` must equal `JWT_SECRET` for existing key hashes to keep matching.
- **Frontend / BFF** — the dashboard never talks to the API directly. Every request goes through `apps/frontend/app/api/proxy/[...path]/route.ts`, which attaches the `httpOnly` cookie as a Bearer header. There is a 30s upstream timeout via `AbortSignal.timeout`. The `apiFetch` helper in `apps/frontend/lib/api/client.ts` normalises both `{ error: { message } }` and `{ message }` payload shapes into `ApiError`.

## Patterns We Do Not Use

- **We do not read `x-forwarded-for` leftmost.** We use `resolveClientIp(socketIp, header, trustedProxyHops)`, counting from the right — the leftmost entry is written by the caller and lets them pick their own IP, which is a rate-limit bypass for IP-scoped rules and a forged attribution in audit logs.
- **We do not let the gateway path return 500 on a malformed UUID.** Every `:id` path param uses `UuidParam` so a non-UUID is a 400, not a driver-level error leaking through `HttpExceptionFilter`.
- **We do not let `method` be a free string on the gateway DTO.** It is enum-validated against `HttpMethod` at the boundary; otherwise a deferred `requestLog.create` fails with `PrismaClientValidationError`, the failure is swallowed, and analytics/webhooks silently lose the request.
- **We do not seed with values that are public.** `prisma/seed.js` and `env.validation.ts` keep a closed `BURNED_VALUES` list (the old demo password and API key committed to git history). Adding a new value to that list is the wrong direction — the list is facts about the past, not a denylist that grows.
- **We do not invent a default for `JWT_SECRET` or `API_KEY_HASH_PEPPER`.** A fallback like `'change-me'` made the API sign tokens with a published value; the only safe behaviour is to refuse to boot.
- **We do not trust `requestLog.create` to be awaited on the hot path.** `RateLimiterService` returns the decision first, then `void persistRequestOutcome(...).catch(logDeferredFailure)`. The caller never pays for the write, but the write must be caught — uncaught rejections terminate the process.
- **We do not key Redis counters by caller-controlled fields.** The rate-limit key is `(project, rule.algorithm, rule.scope, scope-value, rule.id)`. Appending `method`/`endpoint`/`userTier` made a `GLOBAL` rule issue a fresh budget per tuple and let a caller evade their limit by varying the path.
- **We do not put a raw API key into a Redis key name.** Key names show up in `KEYS`/`SCAN`/`MONITOR`/RDB dumps. The `API_KEY` scope keys on `apiKey.id`, never on the raw credential.
- **We do not accept arbitrary webhook URLs.** `IsSafeWebhookUrl` (in `webhooks/validators/`) rejects loopback, link-local, RFC1918, cloud-metadata and single-label hostnames at the boundary. A bare `IsUrl({ require_tld: false })` accepted `http://169.254.169.254/...` and the platform's own Redis.
- **We do not cache a project-scoped response by project key without an authZ check.** `RulesService.listByProject` calls `assertProjectAccess` before reading `cache:rules:project:<projectId>` — the cache key is per project, not per caller.
- **We do not mock Redis in algorithm specs.** The `src/algorithms/**` mocks for `eval` are exactly how the sliding-window-counter defect went unnoticed. The characterization suite in `apps/backend/test/characterization/` uses a real Redis (db15) and pins behaviour with `KNOWN-ODD` notes; do not change a `KNOWN-ODD` assertion to make it "right".
- **We do not change the gateway's status codes or response shape without changing the SDK in the same commit.** `/gateway/check` moved to 429-on-block while `packages/express-sdk` still treated every non-2xx as an outage, so every rate-limited request in a customer's app became a `503 RLAAS_UNAVAILABLE`. The same commit renamed `demo-check` fields the gateway tester page reads and wrapped the rules list in `{ data, nextCursor }` under a dashboard that expected an array. Grep the consumers (SDK, `apps/frontend/lib/api`, `tests/load`) before changing a contract.
- **We do not declare a named throttler without scoping it.** `ThrottlerModule.forRoot` names apply to every `ThrottlerGuard`, and `@Throttle` does nothing on a controller with no guard. Adding `gateway` (1s) to `forRoot` silently put the auth routes on the gateway budget, while `/gateway/*`, which had no guard, got nothing. Each guarded controller `@SkipThrottle`s the budgets that are not its own. `/gateway/check` has no IP throttle on purpose: the SDK calls it from the customer's server, so an IP cap throttles a whole customer, and the project's rules are its traffic control. Only the unauthenticated `demo-check` has one (`demo`, 30/min).
- **We do not change a cache key without changing its bust.** Moving the rules list to per-page keys left `bustRulesCache` deleting a name nothing read, so every write served a stale list until the TTL. Variants of one cached resource live as fields of one hash, so a bust is one `DEL`.
- **We do not put a `next.config` rewrite or `keepalive` on the BFF proxy.** `Connection` is a forbidden header name in `fetch`, and `keepalive` caps the body at 64 KiB and pins to a pooled socket that does not survive an API restart — together they hung the dashboard on every backend redeploy.

## Read First

- `apps/backend/src/main.ts` — bootstrap, global pipe/filter/versioning, the `process.on('unhandledRejection', ...)` backstop.
- `apps/backend/src/app.module.ts` — the actual module wiring order; `ConfigModule` must come first so env validation runs before anything else initialises.
- `apps/backend/src/rate-limiter/rate-limiter.service.ts` — the hot path; `checkRequest` ties together API-key validation, rule matching, algorithm dispatch, idempotency, deferred logging and webhook notification.
- `apps/backend/test/characterization/README.md` — the `KNOWN-ODD` index is the running list of things this code does that look wrong. Read it before assuming an assertion is a bug.
- `apps/backend/src/config/env.validation.ts` — what the API refuses to start without, and why each refusal exists.

---

This file is a living document. Whenever an implementation gets rejected or corrected during a task, add the lesson to "Patterns We Do Not Use" — a rule plus its reason, not just a prohibition.

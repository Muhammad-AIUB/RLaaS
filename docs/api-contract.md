# RLaaS API Contract

**Derived entirely from source, not from README.** Every claim below cites `file:line`
in `apps/backend/src` (or `packages/`) as of commit `3f088ab` on branch
`refactor/baseline`. Where the code contradicts the obvious expectation, it is listed
in [GAPs](#gaps) instead of being smoothed over. Nothing here is a proposal — this is
what the server does today.

## Global conventions

| Property | Value | Source |
|---|---|---|
| Base path | `/api/v1` | `main.ts:12-17` (`setGlobalPrefix('api')` + URI versioning, `defaultVersion: '1'`) |
| Swagger UI | `/docs` (no auth, outside the global prefix) | `main.ts:38` |
| Body validation | `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true` | `main.ts:18-24` |
| Auth scheme | `Authorization: Bearer <JWT>`, HS256, secret `JWT_SECRET` (default `change-me`) | `jwt.strategy.ts:11-14`, `auth.module.ts:21` |
| JWT payload | `{ sub, email, tier }` | `authenticated-user.interface.ts:3-7`, `auth.service.ts:137-141` |
| Token TTL | `JWT_EXPIRES_IN`, default `1d` | `auth.module.ts:23` |
| Success envelope | **None** — handlers return raw JSON | all controllers |
| Error envelope | `{ success: false, error: { message, statusCode, path, timestamp } }` | `common/filters/http-exception.filter.ts:31-39` |
| CORS | **Not enabled** — no `app.enableCors()` anywhere | `main.ts` (absent) |
| Keep-alive | `keepAliveTimeout` 65s, `headersTimeout` 66s | `main.ts:9-10` |

### Status code rules

There is not a single `@HttpCode()` decorator in the codebase (verified by grep), so
NestJS defaults apply:

- `POST` → **201 Created**, including read-only checks like `POST /gateway/check`.
- `GET` / `PATCH` / `DELETE` → **200 OK**.

### Error taxonomy

| Status | Trigger | Body `error.message` |
|---|---|---|
| 400 | DTO validation failure | `string[]`, e.g. `["ip must be an ip address"]` |
| 400 | Unknown property in body (`forbidNonWhitelisted`) | `["property foo should not exist"]` |
| 401 | Missing / expired / invalid Bearer token | `"Unauthorized"` |
| 403 | Authenticated, is a project member, wrong role | `"You do not have access to this project action"` (`project-access.service.ts:43`) |
| 404 | **Not a member of the project** (deliberately indistinguishable from a missing project) | `"Project not found"` (`project-access.service.ts:39`) |
| 404 | Sub-resource missing | `"Rule not found"`, `"API key not found"`, `"Webhook endpoint not found"`, `"Project member not found"`, `"User not found"` |
| 409 | Email already registered | `"Email is already registered"` (`auth.service.ts:30`) |
| 409 | Mutating the project owner membership | `"The project owner cannot be modified"` (`project-access.service.ts:62`) |
| 500 | Anything not an `HttpException` — **including every Redis failure on the gateway path** | `"Internal server error"` |

The filter is `@Catch()` with no argument (`http-exception.filter.ts:10`), so
non-HTTP exceptions are swallowed into a 500 with a fixed message; the original error
never reaches the client.

---

## 1. Gateway (the product surface)

### `POST /api/v1/gateway/check`

**No auth guard.** `GatewayController` (`gateway.controller.ts:11-17`) carries no
`@UseGuards`, and no global `APP_GUARD` is registered (`app.module.ts:18-38`). The API
key travels in the JSON **body**, not a header.

Request — `GatewayCheckDto` (`gateway/dto/gateway-check.dto.ts`):

```jsonc
{
  "apiKey": "rlaas_live_...",  // string, non-empty, <=255
  "ip": "203.0.113.10",        // must pass @IsIP() — v4 or v6
  "endpoint": "/api/products", // string, non-empty, <=255
  "method": "GET",             // string, non-empty, <=16 — NOT enum-validated
  "userTier": "free",          // string, non-empty, <=64 — NOT enum-validated
  "idempotencyKey": "idem_01"  // optional, <=120
}
```

Response — `GatewayCheckResult` (`rate-limiter/interfaces/gateway-check-result.interface.ts`),
**HTTP 201 in every outcome, allowed or blocked**:

```jsonc
{
  "allowed": true,
  "limit": 100,
  "remaining": 97,
  "retryAfter": 0,                  // seconds; 0 when allowed
  "algorithm": "fixed_window",      // echoes the rule that ran
  "reason": "RATE_LIMIT_EXCEEDED",  // present only when allowed === false
  "ruleId": "uuid",                 // absent when the default rule was synthesized
  "ruleName": "Free tier global protection",
  "scope": "GLOBAL",
  "idempotencyStatus": "created"    // "created" | "replayed"; only when idempotencyKey was sent
}
```

`reason` is one of `RATE_LIMIT_EXCEEDED` | `API_KEY_INVALID` | `API_KEY_REVOKED`.

Behaviour, in execution order (`rate-limiter.service.ts:133-225`):

1. `validateApiKey` — HMAC-SHA256 the raw key with `API_KEY_HASH_PEPPER` (falling back
   to `JWT_SECRET`, then `change-me`), look it up (Redis cache, 30s TTL, DB fallback)
   (`api-keys.service.ts:156-205`).
   - Unknown → `{allowed:false, reason:"API_KEY_INVALID", limit:0, remaining:0, retryAfter:0, algorithm:"fixed_window"}`, still **HTTP 201** (`rate-limiter.service.ts:309-320`).
   - `status === REVOKED` or `expiresAt <= now` → same shape, `reason: "API_KEY_REVOKED"`.
2. If `idempotencyKey` present, look up
   `rlaas:idempotency:{projectId}:{key}:{sha256(apiKeyId,ip,endpoint,method,userTier)}`.
   A hit returns the cached body with `idempotencyStatus: "replayed"` and **consumes no
   quota and writes no request log** (`rate-limiter.service.ts:153-163`).
3. Rule resolution — `rulesService.findMatchingRule`, else a synthetic default from env
   (`RATE_LIMIT_DEFAULT_LIMIT`=100, `RATE_LIMIT_DEFAULT_WINDOW_SECONDS`=60,
   `RATE_LIMIT_DEFAULT_ALGORITHM`=`fixed_window`) (`rate-limiter.service.ts:262-277`).
4. Counter key:
   `rlaas:{projectId}:{algorithm}:{scope}:{scopeValue}:{METHOD}:{endpoint}:{tier}`
   (`rate-limiter.service.ts:227-244`).
5. `algorithm.consume()` against Redis.
6. Fire-and-forget `persistRequestOutcome` (`void`, line 110/195) writing a `RequestLog`
   row and touching `apiKey.lastUsedAt`.
7. On block, fire-and-forget `webhooksService.notifyHighBlockedActivity`.

Errors: 400 on validation; **500 whenever Redis is unreachable** (see
[Q3](#q3-redis-down--fail-open-or-fail-closed)); no 401/403 exist on this route.

### `POST /api/v1/gateway/demo-check`

Public, unauthenticated demo. Hardcoded limit **5 requests / 10 seconds**
(`gateway.controller.ts:8-9`).

Request — `DemoCheckDto` (`gateway/dto/demo-check.dto.ts`):

```jsonc
{
  "algorithm": "token_bucket",  // enum: fixed_window | sliding_window_log | sliding_window_counter | token_bucket
  "identifier": "demo-user-1"   // 1-128 chars, /^[a-zA-Z0-9_-]+$/
}
```

Response (**201**), a different shape from `/check` — milliseconds, not seconds
(`gateway.controller.ts:38-46`):

```jsonc
{
  "allowed": false,
  "algorithm": "token_bucket",
  "limit": 5,
  "remaining": 0,
  "resetInMs": 2000,        // retryAfter*1000 when retryAfter > 0, else 0
  "retryAfterMs": 2000,     // null when allowed
  "timestamp": "2026-08-27T10:00:00.000Z"
}
```

Counter key is `demo:{identifier}:{algorithm}` — global, caller-supplied, not IP-scoped.

Errors: 400 (bad enum / identifier charset / unknown property), 500 on Redis failure.

---

## 2. Auth — `/api/v1/auth`

All four routes are unguarded (`auth.controller.ts:14`); the `@Public()` decorator on
them is inert because no global guard exists.

| Route | Status | Request | Response |
|---|---|---|---|
| `POST /register` | 201 | `{ email, password (8-128), fullName (<=120), tier? }` | `{ accessToken, user: { id, email, fullName, tier, createdAt, updatedAt } }` |
| `POST /login` | 201 | `{ email, password }` | same `AuthResponse` |
| `POST /forgot-password` | 201 | `{ email }` | `{ message: "If that email is registered…", expiresInSeconds: 600 }` |
| `POST /reset-password` | 201 | `{ email, code (exactly 6), newPassword (8-128) }` | `{ message: "Password reset successfully" }` |

- `tier` enum: `FREE` \| `PRO` \| `BUSINESS` \| `ENTERPRISE`, default `FREE`.
- `register` → 409 if the email exists (`auth.service.ts:29-31`).
- `login` → 401 `"Invalid credentials"` for unknown email, inactive user, or bad
  password — one message for all three (`auth.service.ts:58-66`).
- `forgot-password` stores a 6-digit code at `pwd_reset:{email}` for 600s and returns
  the **same body for every email**, registered or not — the code is not in it. With
  `NODE_ENV != production` and `AUTH_LOG_RESET_CODE=true` the code is written to the
  server log instead (`auth.service.ts:99-136`); there is no email transport.
- `reset-password` → 400 `"Invalid or expired reset code"` on any mismatch; deletes the
  Redis key on success (`auth.service.ts:115`).
- Redis unreachable → 500 on both password-reset routes (no try/catch on
  `setex`/`get`/`del`).

---

## 3. Users — `/api/v1/users`

| Route | Guard | Status | Response |
|---|---|---|---|
| `GET /me` | JWT | 200 | `{ id, email, fullName, tier, createdAt, updatedAt }` |

404 `"User not found"` if the JWT `sub` no longer resolves (`users.controller.ts:20-22`).
Profile is cached 60s at `cache:user:profile:{id}`; all Redis calls here are wrapped in
try/catch and fall back to the DB (`users.service.ts:50-72`).

---

## 4. Projects — `/api/v1/projects`

JWT on the whole controller (`projects.controller.ts:23`). Role sets from
`projects.constants.ts`: OWNER-only, WRITE = OWNER+ADMIN, READ = OWNER+ADMIN+VIEWER.

| Route | Status | Required role | Request | Response |
|---|---|---|---|---|
| `POST /` | 201 | any authenticated user | `{ name (<=120), description? (<=2000), environment? (<=50, default "production"), isActive? (default true) }` | project + `_count{apiKeys,rules}` + `currentRole` |
| `GET /` | 200 | membership implicit | — | array of the above |
| `GET /:projectId` | 200 | READ | — | project detail |
| `PATCH /:projectId` | 200 | WRITE | partial of create | project detail |
| `DELETE /:projectId` | 200 | OWNER | — | `{ success: true }` |

Creation auto-inserts the creator as `OWNER` and generates a unique slug from the name
(`projects.service.ts:55-88`, `:201-218`). `GET /:projectId` returns 404 for non-members
before it ever checks whether the project exists.

Caching: list `cache:projects:user:{userId}` 120s, detail
`cache:project:{projectId}:user:{userId}` 120s.

### Members — `/api/v1/projects/:projectId/members`

| Route | Status | Required role | Request | Response |
|---|---|---|---|---|
| `GET /` | 200 | **WRITE** (VIEWER gets 403) | — | members with `user{id,email,fullName,tier}` |
| `POST /` | 201 | OWNER | `{ email, role: OWNER\|ADMIN\|VIEWER }` | upserted member |
| `PATCH /:memberId` | 200 | OWNER | `{ role }` | updated member |
| `DELETE /:memberId` | 200 | OWNER | — | `{ success: true }` |

404 `"User not found"` when the invited email has no account. Adding yourself is forced
back to `OWNER`. Owner role changes/removals raise 409 through `ensureMutableMember`.

`PATCH` and `DELETE` bust `cache:membership:{projectId}:{userId}` (F5), so a demotion or
a removal takes effect on the next request rather than after the 120s TTL. `POST` needs
no equivalent: only positive membership lookups are cached, so there is no negative entry
to clear.

---

## 5. API keys — `/api/v1/projects/:projectId/api-keys`

| Route | Status | Required role | Request | Response |
|---|---|---|---|---|
| `POST /` | 201 | WRITE | `{ name (<=120), expiresAt? (ISO date) }` | full row **plus `key`** |
| `GET /` | 200 | READ | — | array of rows (no `key`, no `hashedKey`) |
| `PATCH /:apiKeyId/revoke` | 200 | WRITE | — | updated row, `status: "REVOKED"` |

The plaintext key (`rlaas_live_` + 48 hex chars, `api-keys.service.ts:195-197`) is
returned **once**, at creation. Storage is `HMAC-SHA256(key, pepper)` with
`hashVersion: "hmac-sha256-v1"`; `keyPrefix` is the first 18 chars. Revocation busts
both the per-key gateway cache and the project list cache, so it takes effect
immediately rather than after the 30s TTL (`api-keys.service.ts:137-139`).

404 `"API key not found"` if the id does not belong to the project.

`GET /` selects an explicit column list that omits `hashedKey` (F3). The create and
revoke responses still carry it — see GAP-3.

---

## 6. Rules — `/api/v1/projects/:projectId/rules`

| Route | Status | Required role |
|---|---|---|
| `POST /` | 201 | WRITE |
| `GET /` | 200 | READ |
| `POST /simulate` | 201 | WRITE |
| `PATCH /:ruleId` | 200 | WRITE |
| `DELETE /:ruleId` | 200 | WRITE |

`CreateRuleDto` (`rules/dto/create-rule.dto.ts`):

```jsonc
{
  "name": "Free tier global protection",   // <=120, required
  "description": "...",                    // optional, <=2000
  "priority": 100,                          // int 1..1_000_000, required
  "scope": "GLOBAL",                        // IP | API_KEY | USER_TIER | ENDPOINT | GLOBAL
  "targetValue": "free",                    // optional, <=255
  "endpointPattern": "/api/products/*",     // optional, <=255, '*' -> '.*' regex
  "method": "GET",                          // optional enum GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD
  "userTier": "FREE",                       // optional enum
  "algorithm": "FIXED_WINDOW",              // required, SCREAMING_CASE (Prisma enum)
  "limit": 1000,                            // int 1..1_000_000
  "windowSeconds": 60,                      // int 1..86_400
  "burstCapacity": 200                      // optional int, accepted and stored, never read
}
```

`PATCH` takes `PartialType(CreateRuleDto)` — every field optional, **no `isActive`**.

Response for create/update is the raw Prisma row (includes `isActive`, `createdAt`,
`updatedAt`). Delete returns `{ success: true }`. 404 `"Rule not found"` when the rule
belongs to another project.

`POST /simulate` — `SimulateRuleDto`:
`{ rule: CreateRuleDto, request: GatewayCheckDto, requestCount?: 1..1000 }`.

```jsonc
// non-matching rule
{ "matches": false, "reason": "RULE_DOES_NOT_MATCH_REQUEST" }

// matching rule (201)
{
  "matches": true,
  "simulationKey": "rlaas:simulation:{projectId}:{uuid}:{sha256[0:16]}",
  "simulatedRequests": 3,
  "result": { "allowed": false, "limit": 5, "remaining": 0, "retryAfter": 8, "algorithm": "fixed_window" },
  "rule": { "name": "...", "scope": "...", "algorithm": "...", "limit": 5, "windowSeconds": 10 }
}
```

`result` is the **last** iteration only; the key includes a fresh `randomUUID()` per
call, so simulations never collide with production counters or with each other
(`rules.service.ts:380-387`).

### Rule matching (`rules.service.ts:242-306`)

Active rules are loaded, grouped by scope, each group sorted by `priority ASC` then
`createdAt ASC`, then concatenated in this fixed order and `candidates[0]` wins:

```
IP  ->  API_KEY  ->  USER_TIER  ->  ENDPOINT  ->  GLOBAL
```

Scope order outranks `priority`: an `IP` rule with `priority: 999` beats a `GLOBAL` rule
with `priority: 1`. `method: null` matches any method. `API_KEY` scope matches
`targetValue` against the key id, the key prefix, or the raw key from the request body.

---

## 7. Analytics — `/api/v1/projects/:projectId/analytics`

Query DTO for every `GET`: `{ from?: ISO date, to?: ISO date, limit?: int 1..100 }`.

| Route | Status | Role | Response |
|---|---|---|---|
| `GET /overview` | 200 | READ | `{ totalRequests, allowedRequests, blockedRequests, blockRate }` (percent, 2dp) |
| `GET /top-ips` | 200 | READ | `[{ ip, requests }]`, default limit 5 |
| `GET /top-endpoints` | 200 | READ | `[{ endpoint, method, requests }]`, default limit 5 |
| `GET /algorithms` | 200 | READ | `[{ algorithm, requests, averageRetryAfter, averageResponseTimeMs }]` |
| `GET /logs` | 200 | READ | request logs + hydrated `apiKey{id,name,keyPrefix,status}` and `rule{id,name,scope,priority}`, default limit 20 |
| `POST /snapshots` | 201 | WRITE | `AnalyticsSnapshot` row |
| `GET /snapshots` | 200 | READ | array of snapshots, default limit 20 |

`POST /snapshots` body: `{ window: HOURLY|DAILY|WEEKLY|MONTHLY, from?, to? }`; upserts on
`(projectId, window, periodStart, periodEnd)`.

The four aggregate `GET`s cache for 60s at
`cache:analytics:{type}:{projectId}:{from}:{to}:{limit}`; `/logs` and both snapshot
routes do not cache.

---

## 8. Audit logs — `GET /api/v1/projects/:projectId/audit-logs`

200. Roles: OWNER or ADMIN, asserted in the controller rather than the service
(`audit.controller.ts:28-31`). Query: `{ from?, to?, limit? 1..200 }` (default 50).
Returns rows ordered `createdAt DESC` with `actor{id,email,fullName}` joined.

Recorded actions (`action` strings, from the services): `auth.registered`,
`auth.logged_in`, `auth.password_reset`, `project.created|updated|deleted`,
`project.member_added|member_role_updated|member_removed`, `api_key.created|revoked`,
`rule.created|updated|deleted|simulated`, `webhook.created|updated|deleted`.

Audit writes are best-effort: `AuditService.log` swallows its own errors and returns
`null` (`audit.service.ts:37-44`).

---

## 9. Webhooks — `/api/v1/projects/:projectId/webhooks`

All four routes require OWNER or ADMIN.

| Route | Status | Request |
|---|---|---|
| `GET /` | 200 | — |
| `POST /` | 201 | `{ name (<=120), url (IsUrl, require_tld:false), eventType?, signingSecret? (<=255), blockedRequestsThreshold? (1..100000, default 25), windowSeconds? (30..86400, default 300), cooldownSeconds? (30..86400, default 300), isActive? (default true) }` |
| `PATCH /:webhookId` | 200 | subset: `name, url, blockedRequestsThreshold, windowSeconds, cooldownSeconds, isActive` |
| `DELETE /:webhookId` | 200 | — |

`eventType` has exactly one member: `HIGH_BLOCKED_ACTIVITY`. It is settable on create but
**not on update** — `UpdateWebhookEndpointDto` omits both `eventType` and `signingSecret`,
so a signing secret can never be rotated through the API.

Responses are raw Prisma rows — **including `signingSecret` in cleartext** on `GET`,
`POST`, and `PATCH`.

### Outbound delivery (`webhooks.service.ts:161-256`)

Triggered fire-and-forget from a blocked gateway check. Per active endpoint: count
`BLOCKED` logs for the project in the last `windowSeconds`; skip if below threshold;
claim `rlaas:webhook:cooldown:{endpointId}:{projectId}` with `SET NX EX cooldownSeconds`;
`POST` with a 5s `AbortSignal.timeout`.

Headers sent: `content-type: application/json`, `x-rlaas-event: HIGH_BLOCKED_ACTIVITY`,
and `x-rlaas-signature: HMAC-SHA256(body, signingSecret)` when a secret is set.

Body:

```jsonc
{
  "event": "HIGH_BLOCKED_ACTIVITY",
  "projectId": "uuid",
  "blockedRequests": 42,
  "threshold": 25,
  "windowSeconds": 300,
  "triggeredAt": "2026-08-27T10:00:00.000Z",
  "sample": { "endpoint": "/api/products", "method": "GET", "ruleId": "uuid", "ruleName": "...", "ipAddress": "203.0.113.10" }
}
```

Delivery failures are logged and dropped — no retry, no dead-letter. The blocked-request
count is **project-wide**, not scoped to the rule or endpoint in `sample`.

---

## 10. Health — `GET /api/v1/health`

Unauthenticated. Render's `healthCheckPath` points here (`render.yaml:10`).

```jsonc
{ "status": "ok", "timestamp": "...", "services": { "api": "up", "redis": "up" } }
```

`redis` is `"up"` when `PING` returns `PONG`, else `"degraded"` — but see
[GAP-7](#gap-7--health-cannot-report-the-degraded-state-it-was-written-to-report): the
`"degraded"` branch is unreachable in practice.

---

# Answers to the three questions

## Q1: Which rate limit algorithm is actually implemented?

**All four are implemented as Lua scripts — but only three of them behave as named.**

| Algorithm | Enum value | Redis structure | Verdict |
|---|---|---|---|
| Fixed window | `fixed_window` | `INCR` + `EXPIRE` on first hit, `TTL` for retry | Correct fixed window (`fixed-window-algorithm.service.ts:8-15`) |
| Sliding window log | `sliding_window_log` | `ZREMRANGEBYSCORE` + `ZCARD` + `ZADD`, `PEXPIRE windowMs` | Correct sliding log (`sliding-window-log-algorithm.service.ts:8-33`) |
| Sliding window counter | `sliding_window_counter` | two `GET`s + weighted estimate + `INCR` | **Degrades to a fixed window — see GAP-1** |
| Token bucket | `token_bucket` | `HMGET tokens/updatedAt`, lazy refill, `HSET` + `PEXPIRE` | Correct token bucket (`token-bucket-algorithm.service.ts:8-42`) |

Selection: `rule.algorithm` from the matched DB rule, else `RATE_LIMIT_DEFAULT_ALGORITHM`
(env, default `fixed_window`); any unrecognised value silently falls back to
`fixed_window` (`rate-limiter.service.ts:372-387`).

Every script runs server-side in one `EVAL`, so each check is atomic. The default rule,
and therefore the out-of-the-box behaviour of a fresh install, is **fixed window**
(`.env.example:10`, `render.yaml:22-23`).

Token-bucket detail worth knowing: capacity **is** `rule.limit` and refill is
`limit / windowSeconds` tokens/sec. `burstCapacity` on the rule is never read
(GAP-2), so burst == steady-state limit.

## Q2: Which headers go out on a 429?

**The RLaaS API never emits a 429 and never emits a single rate-limit header.**
`grep -rn "X-RateLimit|Retry-After|429" apps/backend/src` returns zero matches.
`POST /gateway/check` answers **201** whether the verdict is allow or block; the verdict
lives in the JSON `allowed` field.

429 exists only in the Express SDK, which converts the JSON verdict into an HTTP
response (`packages/express-sdk/src/index.ts:94-107`):

| Header | Allowed path (`:88-90`) | Blocked path / 429 (`:95-98`) |
|---|---|---|
| `X-RateLimit-Limit` | yes | yes |
| `X-RateLimit-Remaining` | yes | yes (always `0` — the service zeroes it on block) |
| `X-RateLimit-Algorithm` | yes (non-standard) | yes |
| `Retry-After` | no | yes — seconds, from `result.retryAfter` |
| `X-RateLimit-Reset` | **absent** | **absent** |

The 429 body is a fourth distinct error shape in this codebase:

```jsonc
{ "error": "RATE_LIMIT_EXCEEDED", "limit": 100, "remaining": 0, "retryAfter": 42, "algorithm": "fixed_window" }
```

So: `Limit`, `Remaining`, `Retry-After` yes; `Reset` no; and none of it exists unless the
caller uses the Express SDK. A direct HTTP integration gets no headers at all.

## Q3: Redis down — fail-open or fail-closed?

**Fail-closed on the gateway path, by accident rather than by design. There is no
decision line — there is a missing one.**

The path is: `gateway.controller.ts:22` → `rate-limiter.service.ts:179` →
`fixed-window-algorithm.service.ts:26` (`redis.eval`). None of those three frames has a
try/catch. With `maxRetriesPerRequest: 1` and `lazyConnect: true`
(`redis.module.ts:16`, `:21`), a down Redis rejects the `EVAL` promise, the rejection
propagates uncaught to `HttpExceptionFilter`, which does not recognise it as an
`HttpException` and returns:

```
HTTP 500  {"success":false,"error":{"message":"Internal server error","statusCode":500}}
```

The Express SDK sees `!gatewayResponse.ok`, throws (`index.ts:81-85`), and its catch
returns **503 `RLAAS_UNAVAILABLE`** to the caller's client (`index.ts:110-119`). The
protected request is therefore **blocked**. Fail-closed, end to end.

The three lines where that outcome is actually determined:

| File:line | Code | Effect |
|---|---|---|
| `apps/backend/src/rate-limiter/rate-limiter.service.ts:179` | `const result = await this.algorithmRegistryService.get(rule.algorithm).consume({...})` | The only call that must succeed, and the only one with no fallback |
| `apps/backend/src/common/filters/http-exception.filter.ts:17-20` | `exception instanceof HttpException ? ... : HttpStatus.INTERNAL_SERVER_ERROR` | Turns the Redis rejection into a 500 |
| `packages/express-sdk/src/index.ts:110-119` | `catch (error) { ... return response.status(503)... }` | Turns the 500 into a hard block at the edge |

The contrast is the point: every *other* Redis touch in the codebase is wrapped and
degrades to Postgres — API key lookup (`api-keys.service.ts:160-174`), membership
(`project-access.service.ts:76-80`), user profile, project list, rules list, analytics.
Only the counter itself, the one operation Postgres cannot substitute for, is unguarded.
Consequences, plainly:

- Redis down means **100% of protected traffic is rejected**, not merely unmetered.
- The same rejection is a 500 with an opaque message, so callers cannot distinguish
  "rate limiter is broken" from "your request is malformed".
- `POST /gateway/check` carrying an `idempotencyKey` fails one step earlier, at the
  unguarded `redis.get` on `rate-limiter.service.ts:154`.
- There is no config flag, no circuit breaker, and no test covering it —
  `rate-limiter.service.spec.ts` has three cases, none of which simulate a Redis failure.

---

# GAPs

Code vs. reasonable expectation. Nothing here is fixed; this is the list, ordered by
blast radius.

### GAP-1 — `sliding_window_counter` is a fixed window wearing a costume

`sliding-window-counter-algorithm.service.ts:53-54` reads
`previousKey = "{key}:previous:{w-1}"`, but the only key ever written is
`"{key}:current:{w}"` (line 32). No code path ever writes a `:previous:` key, so
`previousCount` is always `0`, the weight term vanishes, and the estimate collapses to
`currentCount`. Users selecting this algorithm get fixed-window behaviour with a
`2 x windowMs` TTL — including the boundary-burst problem it is supposed to solve. The
unit spec passes because it only asserts allow/deny counts inside a single window.

### GAP-2 — `burstCapacity` is accepted, stored, and never read

`create-rule.dto.ts:79-85` validates it, the schema persists it (`schema.prisma:158`),
and no algorithm receives it: `RateLimitParams`
(`rate-limit-params.interface.ts:11-17`) has no such field, and the token bucket derives
capacity from `limit` (`token-bucket-algorithm.service.ts:51-53`). Configuring a burst
silently does nothing.

### GAP-3 — Cached reads bypassed authorization — FIXED

**Was:** `api-keys.service.ts`, `rules.service.ts` and all four aggregates in
`analytics.service.ts` returned the cached value **before** calling
`assertProjectAccess`. Those cache keys are project-scoped only
(`cache:apikeys:project:{projectId}`, `cache:rules:project:{projectId}`,
`cache:analytics:{type}:{projectId}:...`) with no user or role component, so any
authenticated user who knew a project id read another tenant's keys, rules and
analytics for the cache's lifetime (30-120s).

**Now:** all six authorize first, then read the cache. The keys are unchanged — the
ordering was the defect, not the layout. `GET /api-keys` additionally selects an
explicit column list that omits `hashedKey` (F3).

**Still open:**
- `projects.service.ts` (`listByUser`, `getById`) keeps the cache-before-check
  ordering. Its keys include the user id, so the exposure is stale access after a role
  change or removal, not cross-tenant reads.
- The API-key **create** and **revoke** responses still return `hashedKey`; only the
  list was narrowed.
- Entries written before the deploy still contain `hashedKey` and are served until they
  expire (60s).

### GAP-4 — `POST /auth/forgot-password` handed the reset code to the caller — FIXED

**Was:** the live 6-digit code came back in the response body of an unauthenticated
route, so two anonymous requests took over any account by email address, and the Swagger
summary documented that as intended.

**Now:** the code is written only to Redis. The response carries a fixed message and the
TTL, identical for a registered and an unregistered email. `Math.random()` was replaced
with `randomInt` from node:crypto. Since no email transport exists, the code can be
logged server-side for local work by setting `AUTH_LOG_RESET_CODE=true`, which is ignored
when `NODE_ENV=production` (`auth.service.ts:99-146`).

**Still open:** the reset flow has no delivery channel, so in production a user cannot
obtain the code at all. The frontend at `apps/frontend/app/forgot-password/page.tsx:36`
still reads `data.resetCode` and now displays an empty box.

### GAP-5 — Nothing rate-limits the rate limiter

No `ThrottlerModule`, no guard, no per-IP protection on `/auth/login`,
`/auth/forgot-password`, `/gateway/check`, or `/gateway/demo-check`. Login accepts
unlimited password attempts (bcrypt cost 8, `auth.service.ts:33`), and the public
`demo-check` counter is keyed on a caller-supplied identifier (`gateway.controller.ts:28`)
so anyone can exhaust anyone else's demo quota.

### GAP-6 — An unhandled rejection is reachable from a public endpoint

`method` is validated only as `@IsString() @MaxLength(16)`
(`gateway-check.dto.ts:22-25`), then cast unchecked into the Prisma enum:
`method: dto.method as HttpMethod`. A request with `"method": "FOO"` passes validation,
the rate-limit check succeeds and returns 201, then the fire-and-forget
`persistRequestOutcome` rejects inside Prisma. Same exposure for the `userTier`
free-string, though `toPrismaUserTier` maps unknown values to `null` and survives.

**Partly fixed (C4):** all four detached calls in `rate-limiter.service.ts`
(`persistRequestOutcome` and `notifyHighBlockedActivity`, on both the proxy and the
check path) now `.catch()` and log, and `main.ts` registers a process-level
`unhandledRejection` handler, so the process no longer dies. **Still open:** the DTO
still does not validate `method`, so the write itself still fails and that request log
row is still lost — now silently, with a log line.

### GAP-7 — `/health` cannot report the degraded state it was written to report

`health.service.ts:9` awaits `redis.ping()` outside any try/catch, so a down Redis
rejects and the endpoint returns 500 — the `redis === 'PONG' ? 'up' : 'degraded'` ternary
on line 16 can only ever evaluate to `'up'`. Render's health check (`render.yaml:10`)
therefore treats a Redis outage as a dead API and will recycle the instance.

### GAP-8 — No rate-limit headers and no 429 from the API itself

Covered in Q2. Direct HTTP consumers receive 201 + JSON for a block, with no
`Retry-After` and no `X-RateLimit-*`. `X-RateLimit-Reset` does not exist anywhere, in the
API or the SDK.

### GAP-9 — The SDK cannot read the API's error messages

The SDK narrows errors with
`'message' in result ? result.message : 'Gateway request failed'`
(`packages/express-sdk/src/index.ts:82-84`), and `RlaasErrorResponse`
(`packages/shared-types/src/index.ts:41-44`) declares `{ message, statusCode }`. The
server actually returns `{ success, error: { message, statusCode, path, timestamp } }`
(`http-exception.filter.ts:31-39`) — `message` is nested. Every upstream error therefore
surfaces to the integrator as the literal string `"Gateway request failed"`.

### GAP-10 — `shared-types` has drifted from the server contract

`GatewayCheckRequest` omits `idempotencyKey`, which the server accepts
(`gateway-check.dto.ts:33-37`); `GatewayAllowResponse`/`GatewayBlockResponse` omit
`idempotencyStatus`, which the server returns (`gateway-check-result.interface.ts:13`).
The SDK builds its payload from the stale type, so an SDK user cannot send an idempotency
key at all.

### GAP-11 — Rules cannot be deactivated through the API

`findMatchingRule` filters on `isActive: true` (`rules.service.ts:251`) and the column
defaults to `true` (`schema.prisma:159`), but `CreateRuleDto` has no `isActive` field and
`UpdateRuleDto = PartialType(CreateRuleDto)` inherits that hole. The only way to stop a
rule is to delete it.

### GAP-12 — `priority` does not mean priority

Scope order (IP → API_KEY → USER_TIER → ENDPOINT → GLOBAL) is applied before `priority`
(`rules.service.ts:260-290`), so a high-priority GLOBAL rule can never outrank any
matching IP rule. The DTO presents `priority` as a required 1..1,000,000 ordering knob
with no hint that it only orders within a scope.

### GAP-13 — Idempotent replays are invisible to analytics and quota

A replayed check returns the cached verdict and skips both `consume()` and
`persistRequestOutcome` (`rate-limiter.service.ts:153-163`). For the length of
`IDEMPOTENCY_TTL_SECONDS` (default 300), repeated requests with the same key consume no
quota and appear nowhere in `RequestLog`, so `/analytics/overview` undercounts real
traffic. The cached body is also written after the response is built, so a replay never
re-evaluates a key that was revoked in the meantime.

### GAP-14 — `averageResponseTimeMs` is always 0

`analytics.service.ts:170` averages `responseTimeMs`, but `persistRequestOutcome`
(`rate-limiter.service.ts:343-364`) never writes that column and the schema leaves it
nullable (`schema.prisma:188`). Same for `requestId` (`schema.prisma:176`) — selected by
`/analytics/logs`, never populated. The dashboard renders a metric that cannot move.

### GAP-15 — `signingSecret` is returned in cleartext and cannot be rotated

Webhook handlers return the raw Prisma row (`webhooks.service.ts:29-33,46-58,96-108`), so
`GET /webhooks` exposes every signing secret to any OWNER/ADMIN response, log, or browser
cache. `UpdateWebhookEndpointDto` omits `signingSecret` and `eventType`, so rotation
requires delete-and-recreate.

### GAP-16 — Webhook alerts count project-wide blocks, not rule-specific ones

`webhooks.service.ts:179-187` counts every `BLOCKED` log for the project in the window,
while the payload's `sample` names one endpoint/rule/IP (`:216-222`). An alert that reads
as "this endpoint is under attack" is really "this project crossed N blocks". No retry
and no dead-letter on delivery failure (`:249-254`).

### GAP-17 — `POST /gateway/check` returns 201 Created

No `@HttpCode()` exists in the codebase, so the hottest, most read-only route in the
product answers `201` (`main.ts` defaults + `gateway.controller.ts:19-23`). Harmless for
the SDK, which only checks `response.ok`, but wrong for anything doing status-based
routing.

### GAP-18 — `checkProjectRequest` is dead code

`rate-limiter.service.ts:42-131` implements a full project-scoped check keyed on
`apiKeyId`, and no controller routes to it — grep finds exactly one caller,
`rate-limiter.service.spec.ts:206`. It duplicates ~90 lines of `checkRequest` including
the idempotency-free variant of the same rule/consume/persist sequence, so the two will
drift.

### GAP-19 — Config defaults shipped insecure — FIXED

**Was:** `JWT_SECRET` defaulted to `change-me` in `auth.module.ts` and
`jwt.strategy.ts`, and `API_KEY_HASH_PEPPER` fell back to `JWT_SECRET` and then to
`change-me` in `api-keys.service.ts` (and in `prisma/seed.js`). A deploy that skipped
both variables started anyway, with a signing secret published in this repository —
tokens for any user id could be forged.

**Now:** no fallback anywhere. `config/env.validation.ts` runs as `ConfigModule`'s
`validate` and refuses to start unless `JWT_SECRET` and `API_KEY_HASH_PEPPER` are both
set and non-blank; `auth.module.ts` and `jwt.strategy.ts` use `getOrThrow`; `main.ts`
exits non-zero when bootstrap rejects (`ConfigModule.forRoot` is async, so the failure
arrives as a rejected promise, not a synchronous throw).

**Operational note:** `API_KEY_HASH_PEPPER` used to be optional, and where it was unset
the stored API-key hashes were peppered with `JWT_SECRET`. Setting it to a *new* value
therefore invalidates every existing key. The refusal message says so. Environments that
relied on the fallback must set it to the same value as `JWT_SECRET`.

### GAP-20 — Assorted contract inconsistencies

- `GET /projects/:id/members` requires WRITE while every other read allows VIEWER
  (`projects.service.ts` `listMembers` vs `PROJECT_READ_ROLES`).
- `retryAfter` units differ by algorithm: fixed window returns the raw Redis `TTL`
  (whole seconds), the others `Math.ceil(ms/1000)`; a token bucket refilling faster than
  1/s yields `retryAfter: 0`, which the SDK forwards as `Retry-After: 0`.
- `/gateway/demo-check` speaks milliseconds (`resetInMs`, `retryAfterMs`) while
  `/gateway/check` speaks seconds (`retryAfter`) — two response shapes on one controller.
- Success responses are unwrapped, errors are wrapped in `{success,error}`, the SDK's 429
  is a third shape, and `shared-types` describes a fourth. Four conventions in one
  product.
- No `enableCors()` (`main.ts`). Today the Next.js app proxies server-side
  (`apps/frontend/app/api/proxy/[...path]/route.ts:20`), so nothing breaks — but any
  browser-side or third-party-origin integration fails at the preflight.
- `@Public()` (`auth/decorators/public.decorator.ts`) is dead: no global guard consults
  it, and `AuthController` has no `@UseGuards`. If a global guard is ever added, the
  decorator starts mattering silently.
- Swagger UI is served unauthenticated at `/docs` (`main.ts:38`), documenting the full
  surface including the reset-code flow.

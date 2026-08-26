# Characterization suite — rate limiting

These tests record what the rate-limiting endpoints do **today**, so that a
refactor has something to break. They are not a specification: several
assertions pin down behaviour that is wrong. Every one of those is marked with
a `KNOWN-ODD` comment explaining what the code does and why it looks incorrect.

**Rule: do not change an assertion here to make it "right".** If you
deliberately change product behaviour, change the test in the same commit and
delete the `KNOWN-ODD` note. If a test starts failing and you did not intend to
change that behaviour, you have found a regression.

## Running

```bash
pnpm test:characterization
```

`pnpm test` (in `apps/backend`, or at the repo root) runs the unit suite and
then this one. The two configs stay separate — `jest.config` in
`package.json` still only picks up `src/**/*.spec.ts` — they are chained by
the `test` script.

Redis must be reachable. Anything works:

```bash
docker run --rm -p 6379:6379 redis:7-alpine
```

To point at a different instance (an Upstash test database, for example):

```bash
CHARACTERIZATION_REDIS_URL=rediss://<user>:<pass>@<host>:<port> pnpm test:characterization
```

The suite uses Redis **database index 15** by default and flushes it between
tests. `globalSetup` refuses to start if that index is not empty, so it can
never wipe a database it does not own. Override with
`CHARACTERIZATION_ALLOW_DIRTY=1` only if you are certain.

In CI both suites run in the `validate` job
([.github/workflows/ci.yml](../../../../.github/workflows/ci.yml)), against a
`redis:7-alpine` service container. A fresh container satisfies the
empty-index check above, so no override is needed there.

## What is real and what is not

| Dependency | In these tests | Why |
|---|---|---|
| Redis | **Real server** | TTL, key layout and Lua atomicity are the behaviours being recorded. A mock cannot capture them — the existing `src/algorithms/**` specs mock `eval` and that is exactly why the sliding-window-counter defect went unnoticed. |
| Postgres | In-memory double (`support/fake-prisma.ts`) | The only database this repo is configured against is a hosted Neon instance. Writing test fixtures into it is not acceptable, and the Docker engine is not running on this machine, so a testcontainer is not available either. |
| Nest app | **Real** | Real module graph, real guards, real `ValidationPipe`, real exception filter, real versioning. |

Consequence: the suite characterizes the HTTP contract, validation, RBAC and
every Redis interaction. It does **not** characterize Postgres-side behaviour —
column defaults, cascade deletes, unique-constraint errors, driver-level date
serialisation. When Docker is available, swapping `FakePrisma` for a Postgres
testcontainer is the single upgrade that closes that gap.

## KNOWN-ODD index

Behaviour recorded here that looks wrong, worst first.

| Where | Recorded behaviour |
|---|---|
| `api-keys` › create / revoke response | Both still return `hashedKey`, the stored credential digest. The list no longer does (F3), and the cached-list-to-non-member hole is closed (C3). |
| `gateway-check` › expired key | An expired key is rejected on the first call, then **allowed** for the next 30 seconds. The cached copy round-trips `expiresAt` through JSON, and comparing the resulting string to a `Date` yields `NaN`, so the expiry check silently passes. |
| `algorithms-redis` › sliding window counter | The script reads `<key>:previous:<n-1>`, which nothing ever writes. The previous window is always counted as zero, so the algorithm degrades to a fixed window and allows up to 2× the limit across a boundary. |
| `rules` › `PATCH` with `isActive` | Rejected with 400. `UpdateRuleDto` is `PartialType(CreateRuleDto)` and `CreateRuleDto` has no `isActive`, so the dashboard's activate/deactivate switch — which posts exactly that body — can never work. |
| `gateway-check` › rule scoping | A `GLOBAL` rule still composes its Redis key from method + endpoint + tier, so "N per minute globally" is really N per minute per endpoint per method per tier. |
| `gateway-check` › tier bucket | `userTier` is read from the request body, so the caller chooses its own bucket, and with a `USER_TIER` rule its own limit. |
| `gateway-check` › deferred writes | The decision is returned before the request-log write completes. Deliberate — but a failed write is only logged, so the row is lost silently. (Its rejection is caught as of C4; it used to be uncaught.) |
| `gateway-check` › unknown key | Returns `201` with a decision body rather than `401`/`403`, and reports `algorithm: fixed_window` although no algorithm ran. |
| `gateway-check` › `method` validation | `method` is only `@IsString()`/`@MaxLength(16)` but is cast to the Prisma `HttpMethod` enum when the log row is written. |
| `demo-check` › identifier | Unauthenticated callers mint one Redis key per identifier string, with no cap. |
| `demo-check` › `resetInMs` | Always `0` while the caller is allowed, so a client cannot show a countdown until it has already been blocked. |
| `rules` › `simulate` | Every call embeds a fresh `randomUUID` in the key, so two identical simulations never share a counter and each leaves a key behind for the whole window. |
| All POST endpoints | Return `201 Created` for read-only decisions, because Nest's default POST status is never overridden. |

## Files

```
support/env-setup.ts     pinned env vars + safety rails (dead DATABASE_URL, Redis db15)
support/global-setup.ts  refuses to run without a real, empty Redis
support/fake-prisma.ts   in-memory Postgres double; throws on unrecognised queries
support/test-app.ts      boots the real app; mirrors main.ts bootstrap
```

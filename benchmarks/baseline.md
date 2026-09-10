# RLaaS Rate Limit Benchmark — Baseline

Append-only. **Never delete or edit a previous row.** Every optimization adds a new
row to [Run log](#run-log) plus a detail section below it. If a number was not
measured, write `not measured` — never carry a value forward from another run and
never estimate.

---

## Measurement environment

| Property | Value |
|---|---|
| Target | `https://rlaas.onrender.com` (Render, region `singapore`, **plan: free**) — [render.yaml:5-6](../render.yaml) |
| Backend commit at first run | `3f088ab` (branch `refactor/baseline`) |
| Postgres | Neon, `ap-southeast-1` (pooler) |
| Redis | `REDIS_URL` is set in the Render dashboard (`sync: false`, [render.yaml:39-40](../render.yaml)). **Provider not verifiable from this repo** — no `@upstash/*` dependency exists ([apps/backend/package.json](../apps/backend/package.json)); the client is plain `ioredis` |
| Load client | local workstation, Windows, k6 `v2.0.0-rc1` |
| Client → origin network | DNS 64ms, TCP connect 68ms, TLS 227ms (cold) / 43ms (warm) — every client-side number below **includes ~65ms of one-way network** |
| Active rule on target | `Global API Limit` — scope `GLOBAL`, algorithm `sliding_window_counter`, limit `1000` |

Client-measured latency is not server latency. Subtract TLS+connect when comparing
across runs from a different location, or re-run from the same machine.

---

## Run log

| # | Date | Commit | Change | Cold start TTFB | Warm p50 | Warm p95 | Warm p99 | Throughput | Redis RTT | Load profile |
|---|---|---|---|---|---|---|---|---|---|---|
| 0a | 2026-05-09 | pre-`3f088ab` | (historical, found in `tests/results/`) | not measured | 1119ms | 1846ms | 1905ms | 23.6 req/s | not measured | 65 VUs, 65s, ramping |
| 0b | 2026-08-27 | `3f088ab` | baseline probe, no load | **92,689ms** | 178ms | not measured | not measured | not measured | not measured | 1 cold + 10 warm, serial |
| 1 | 2026-08-27 | `3f088ab` | **BASELINE** stepped load, deployed | not measured (warmed first) | 2402ms @100VU | 3018ms @100VU | 3422ms @100VU | 38.0 req/s | not measured | 10→25→50→100 VU, 60s each |
| 2 | 2026-09-10 | `7d2b0a5` | auth-path probe (no load) — see [Run 2](#run-2--auth-path-probe-2026-09-10-commit-7d2b0a5) | not measured (already warm) | not measured | not measured | not measured | not measured | not measured | serial single client |

Run 0b is a probe. **Run 1 is the load baseline** every optimization compares against.

Redis round-trip is `not measured` in run 1: the `Server-Timing` instrumentation
exists only in the working tree, not on the deployed instance (`server_timing_seen`
was 0 across all 9,763 requests). It becomes measurable once a build carrying the
middleware is deployed.

---

## Run 0b — baseline probe (2026-08-27, commit `3f088ab`)

Serial single-client probes. No concurrency.

### Cold start (Render free-tier spin-up)

One sample, taken against an idle instance:

```
dns=0.064s  connect=0.068s  tls=0.227s  ttfb=92.689s  total=92.699s  http=200
```

**92.7 seconds to first byte.** Network setup accounts for 0.23s of that; the
remaining **92.4s is the instance booting**. The Render start command is
`prisma migrate deploy && prisma db seed && node dist/main`
([render.yaml:9](../render.yaml)), so every cold start runs a migration pass and a
full seed before Nest listens.

n=1. A single sample is enough to establish the order of magnitude, not the
distribution. Free instances idle out after ~15 minutes, so each additional sample
costs ~15 minutes of wall clock.

### Warm latency — `GET /api/v1/health` (no Redis, no Postgres)

10 serial samples immediately after the cold start, new TLS connection each time:

| n | min | p50 | p90 | max |
|---|---|---|---|---|
| 10 | 156ms | **178ms** | 227ms | 229ms |

### Warm latency — `POST /api/v1/gateway/check` (full decision path)

1 sample:

```
http=201  ttfb=0.399s  (tls=0.043s of that)
```

```json
{"allowed":true,"limit":1000,"remaining":999,"retryAfter":0,
 "algorithm":"sliding_window_counter","ruleId":"4ffbce46-...","ruleName":"Global API Limit","scope":"GLOBAL"}
```

**~400ms warm vs ~178ms for `/health`.** The ~220ms delta is the decision path that
`/health` skips: Redis `GET` on the api-key cache, a Neon `findMany` for rules, the
Redis `EVAL`, and two fire-and-forget Postgres writes. n=1, so treat 220ms as an
order of magnitude, not a measurement.

---

## Run 1 — stepped load baseline (2026-08-27, commit `3f088ab`)

k6 `tests/load/gateway-check-stepped.k6.js`, closed-loop (no sleep), against the
warmed deployed instance. Four `constant-vus` steps, 60s each, 5s gap. One
warm-up request first so the cold start does not land in step 10.

**9,763 requests, `http_req_failed` 0.00%.** Every request returned 201.

### Latency by concurrency step (client-observed, includes ~65ms network)

| VUs | p50 | p95 | p99 | min | max |
|---|---|---|---|---|---|
| 10 | 269ms | 365ms | 676ms | 191ms | 950ms |
| 25 | 584ms | 940ms | 1102ms | 194ms | 1301ms |
| 50 | 1187ms | 1697ms | 1901ms | 192ms | 2103ms |
| **100** | **2402ms** | **3018ms** | **3422ms** | 247ms | 4410ms |

The knee is between 10 and 25 VUs. p50 tracks concurrency almost linearly
(269 → 584 → 1187 → 2402), the signature of a **saturated single core** queuing
requests, not a code hot spot: 0.1 vCPU cannot run 100 handlers at once, so the
9th request waits behind the 8 ahead of it. The 100-VU numbers measure Render's
throttle, not the decision path. Compare optimizations at the **10-VU row**, where
the CPU is not the bottleneck and code changes are actually visible.

### Allow-path vs block-path

| Verdict | count | p50 | p95 | p99 |
|---|---|---|---|---|
| allowed | 4704 | 892ms | 2495ms | 2895ms |
| blocked | 5059 | 1001ms | 2901ms | 3364ms |

The run crossed the active rule's `limit: 1000` partway through, so **more than
half the requests were blocked** (`allowed: false`). Both paths do the same Redis
+ Postgres work, so the ~110ms p50 gap is mostly the block path landing later in
the run at higher concurrency, not extra work per request. Bucketed separately
here so a future optimization is not judged on a shifting allow/block mix.

### Throughput

38.0 req/s sustained across the whole run — up from run 0a's 23.6 req/s, but 0a
capped at 65 VUs and used a ramping profile, so the two are not directly
comparable. Treat 38 req/s as the run-1 baseline.

---

## Run 2 — auth-path probe (2026-09-10, commit `7d2b0a5`)

Serial single-client probes against the deployed instance, already warm. No
concurrency, so nothing here is comparable to run 1's load numbers. The
question was where time goes on the auth path, not throughput.

### Login, split by whether a password hash runs

`POST /api/v1/auth/login`. An address with no account returns 401 before
`bcrypt.compare` is reached; an address with an account runs it. The gap is the
hash.

| request | n | observed |
|---|---|---|
| unknown email (no hash runs) | 3 | 237ms, 283ms, 378ms |
| real account, wrong password (hash runs) | 3 | 2409ms, 2434ms, 2760ms |
| `POST /auth/register` (hash runs) | 1 | 2374ms |

**~2.1s of that is one bcrypt hash at cost 12** on a 0.1 vCPU instance. Local
reference for the same library on an i7-8665U: cost 8 = 22ms, cost 10 = 91ms,
cost 12 = 402ms — so this instance is ~5.4x slower than that core for identical
work.

### One hash slows down requests that have nothing to do with auth

`bcryptjs` is pure JavaScript, so the work lands on the thread that serves
every other request. Eight parallel `GET /api/v1/health` (Redis ping only, no
Postgres), before and during a single `POST /auth/register`:

| | p50 | max |
|---|---|---|
| baseline | 234ms | 355ms |
| during one hash | 727ms | 1122ms |

**3.1x.** n=1 for the during-run, so treat it as an order of magnitude.

### Where a gateway request actually spends its time

`POST /api/v1/gateway/check` with a key that does not exist, so the handler
returns after `findByRawKey` (Redis GET miss, then one Postgres lookup). The
deployed build now emits `Server-Timing`, which run 1 could not read.

| n | server (`total;dur`) | client TTFB | TCP connect | TLS |
|---|---|---|---|---|
| 6 | 68.7-71.9ms | 217-399ms | 12-31ms | 30-52ms |

**~69ms server, ~150-215ms transit.** The client sits in Bangladesh and the
origin is `singapore`, so most of a request's wall clock is geography, not the
handler. Server-side numbers from this section are directly comparable across
runs; client-side ones are not, unless re-run from the same location.

### Cold start

Not measured in this run — the instance was warm throughout and re-measuring
costs a 15-minute idle window. Run 0b's **92,689ms** stands as the last
measured value, taken when `startCommand` was
`prisma migrate deploy && prisma db seed && node dist/main`. Both the seed
(`152dc31`) and the migration (`8b9ca64`) have since been removed from the
start path, so that figure is now an upper bound rather than a current
reading. **Re-measure before quoting it.**

### Environment notes gathered while probing

- Render free plan stops the instance after 15 minutes without traffic
  ([docs](https://render.com/docs/free)). Paid compute plans do not stop.
- The `Keep Render Alive` workflow asks for every 10 minutes. Its run history
  shows runs landing 1-3 hours apart, then nothing at all for 42 days while the
  workflow still showed as active; a manual dispatch worked throughout. It has
  never held the 15-minute window.
- `GET /health` pings Redis only ([health.service.ts](../apps/backend/src/health/health.service.ts)),
  so warming it does not warm Postgres.
- `PrismaService.onModuleInit` calls `$connect()`, so the pool is opened at
  boot rather than on the first request.
- Neon, from a client in Bangladesh: first query 580ms, then 56ms steady.

---

## Run 0a — historical (2026-05-09, pre-`3f088ab`)

Recovered from `tests/results/gateway-check-summary.json`, not re-run.

| Metric | Value |
|---|---|
| Requests | 1,536 |
| Throughput | 23.6 req/s |
| VUs (max) | 65 |
| Duration | 65.1s |
| avg / med | 1109ms / 1119ms |
| p90 / p95 / p99 | 1772ms / 1846ms / 1905ms |
| min / max | 294ms / 4835ms |
| `http_req_failed` | 0% |

**These latency numbers are trustworthy; the pass/fail numbers in that file are not.**
`checks` reports 16.2% (593 pass / 3072 fail) and both `gateway_allowed_rate` and
`gateway_blocked_rate` are `0` — while `http_req_failed` is `0%`. The cause is a
defect in the load script, not the server: see below.

At 65 VUs the service was already at **p95 1.85s and 23.6 req/s**, on 0.1 vCPU.

---

## Known defects in the measurement tooling

Fix these before trusting any pass/fail rate from `tests/load/gateway-check.k6.js`.

| Defect | Detail |
|---|---|
| Wrong expected status | The script asserts `res.status === 200` ([gateway-check.k6.js:93](../tests/load/gateway-check.k6.js), [:117](../tests/load/gateway-check.k6.js)). The API returns **201** for `POST` — no `@HttpCode()` exists anywhere in the backend. Verified live: `http=201`. Every status check fails. |
| Rates collapse to zero | `isAllowed = check(...) && res.json('allowed') === true` — because `check()` returns false when *any* of its assertions fail, the broken status check drags `gateway_allowed_rate` and `gateway_blocked_rate` to 0 regardless of the actual verdict. |
| Load profile mismatch | Script ramps to 40+25 VUs over 60s. The requested profile is a flat 100 VUs for 60s. |
| Allowed/blocked mixing | With `limit: 1000` on the active rule, a 60s run crosses the limit mid-run and silently switches from measuring the allow path to measuring the block path. These need separate percentile buckets. |

---

## Blocked — not yet measured

| Ask | Status | Why |
|---|---|---|
| 100 VUs × 60s, p50/p95/p99 | **not run** | Needs sign-off to saturate a live free-tier instance, plus the k6 script fixes above |
| Upstash round-trip, isolated | **not measurable from outside** | k6 sees only total HTTP duration. Splitting out Redis time needs server-side timing — a `Server-Timing` header, or populating the `responseTimeMs` column that already exists in `RequestLog` ([schema.prisma:188](../apps/backend/prisma/schema.prisma)) and is never written. Both are code changes. |
| Cold start distribution | **n=1** | Each extra sample needs ~15 min of instance idle time |

---

## How to reproduce

Cold start (instance must have been idle ~15 min):

```bash
curl -s -o /dev/null --max-time 150 -w 'ttfb=%{time_starttransfer}s http=%{http_code}\n' https://rlaas.onrender.com/api/v1/health
```

Warm serial samples:

```bash
for i in $(seq 1 10); do curl -s -o /dev/null --max-time 30 -w '%{time_starttransfer}\n' https://rlaas.onrender.com/api/v1/health; done
```

Load test (once the script defects above are fixed):

```bash
K6_GATEWAY_URL=https://rlaas.onrender.com/api/v1/gateway/check K6_API_KEY=<key> k6 run tests/load/gateway-check.k6.js
```

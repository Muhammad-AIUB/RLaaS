# RLaaS Platform

Rate Limiter as a Service.

RLaaS Platform is a self-hostable programmable rate-limiting system that sits in front of existing APIs and makes one fast decision: should this request be allowed right now?

It is designed as a portfolio-grade monorepo that demonstrates:

- NestJS backend architecture
- Redis-backed distributed rate limiting
- Prisma plus PostgreSQL data modeling
- Next.js operational dashboard
- shared TypeScript contracts
- Express middleware SDK integration
- load testing and algorithm benchmarking
- Docker-based local orchestration

## Problem statement

Most teams already have APIs in production, but rate limiting is often:

- duplicated inside each service
- too simple for real abuse scenarios
- difficult to observe
- hard to evolve safely across products

RLaaS addresses that by separating policy management from runtime enforcement:

- the control plane manages users, projects, API keys, rules, and analytics
- the gateway evaluates a request against the best matching rule using Redis-backed algorithms

## Key features

- Monorepo with `pnpm` workspaces
- NestJS API with modular architecture
- PostgreSQL with Prisma models for durable metadata and analytics
- Redis with Lua-backed atomic operations for hot-path counters
- JWT authentication
- Project, API key, and rule management
- Rule precedence across IP, API key, user tier, endpoint, and global scopes
- Four rate-limiting algorithms:
  - `fixed_window`
  - `sliding_window_log`
  - `sliding_window_counter`
  - `token_bucket`
- Dashboard for projects, rules, API keys, and analytics
- Express middleware SDK in `packages/sdk`
- Real demo app in `examples/express-demo`
- `k6` load testing for `POST /api/gateway/check`
- Algorithm benchmark runner
- Docker Compose for local platform startup

## Tech stack

- Backend: NestJS, TypeScript, Prisma, PostgreSQL, Redis, ioredis
- Frontend: Next.js, TypeScript, Tailwind CSS, Recharts
- SDK: TypeScript, Express middleware
- Infra: Docker Compose
- Tooling: pnpm workspace, Jest, k6, tsx

## Architecture diagram

```text
+----------------------------+
|     Next.js Dashboard      |
| login / projects / rules   |
| api keys / analytics       |
+-------------+--------------+
              | HTTP
              v
+----------------------------+
|         NestJS API         |
| Auth / Projects / Rules    |
| Gateway / Analytics        |
+--------+----------+--------+
         |          |
metadata |          | counters
         v          v
+----------------+  +----------------+
|   PostgreSQL   |  |     Redis      |
| Prisma models  |  | atomic state   |
| logs/snapshots |  | lua scripts    |
+----------------+  +----------------+
              ^
              |
+-------------+--------------+
|     Client APIs / Apps     |
| Express demo / SDK users   |
+----------------------------+
```

## Repository layout

```text
rlaas-platform/
|-- apps/
|   |-- api/
|   `-- dashboard/
|-- packages/
|   |-- sdk/
|   `-- shared/
|-- examples/
|   `-- express-demo/
|-- benchmarks/
|-- load-tests/
`-- docs/
```

## Quick start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Prepare environment files

```bash
copy apps\api\.env.example apps\api\.env
copy apps\dashboard\.env.example apps\dashboard\.env.local
copy examples\express-demo\.env.example examples\express-demo\.env
```

### 3. Start the local stack

```bash
docker compose up --build
```

### 4. Generate Prisma client, migrate, and seed

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev
pnpm --filter api db:seed
```

### 5. Open the platform

- Dashboard: `http://localhost:3001`
- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/health`

## Seeded demo account

The seed script prints the active values after it runs.

Expected demo defaults:

- Email: `demo@rlaas.local`
- Password: `DemoPass123!`
- Raw API key: `rlaas_live_demo_seed_key_1234567890`

## Core API example

Gateway check:

```bash
curl -X POST http://localhost:3000/api/gateway/check ^
  -H "Content-Type: application/json" ^
  -d "{\"apiKey\":\"rlaas_live_demo_seed_key_1234567890\",\"ip\":\"203.0.113.10\",\"endpoint\":\"/api/products\",\"method\":\"GET\",\"userTier\":\"free\"}"
```

Allowed response shape:

```json
{
  "allowed": true,
  "limit": 100,
  "remaining": 88,
  "retryAfter": 0,
  "algorithm": "fixed_window"
}
```

Blocked response shape:

```json
{
  "allowed": false,
  "reason": "RATE_LIMIT_EXCEEDED",
  "limit": 100,
  "remaining": 0,
  "retryAfter": 32,
  "algorithm": "fixed_window"
}
```

## SDK example

```ts
import express from 'express';
import { createRlaasMiddleware } from '@rlaas/sdk';

const app = express();

app.use(
  createRlaasMiddleware({
    apiKey: 'project_api_key',
    gatewayUrl: 'http://localhost:3000/api/gateway/check',
    userTierResolver: (req) => req.user?.tier ?? 'free',
  }),
);
```

See also:

- [packages/sdk/README.md](/e:/rlaas-platform/packages/sdk/README.md)
- [examples/express-demo/README.md](/e:/rlaas-platform/examples/express-demo/README.md)

## Load testing

Run:

```bash
pnpm loadtest:gateway
```

Sample benchmark-style presentation table:

| Scenario | VUs peak | Requests | p95 latency | p99 latency | Result mix |
| --- | ---: | ---: | ---: | ---: | --- |
| Allowed traffic | 40 | 5,280 | 84 ms | 132 ms | 99.6% allowed |
| Blocked traffic | 25 | 2,910 | 71 ms | 118 ms | 98.9% blocked |
| Combined run | 65 | 8,190 | 89 ms | 145 ms | Expected split preserved |

These are sample portfolio numbers for presentation. Replace them with your latest measured output when preparing a final demo.

## Algorithm benchmark

Run:

```bash
pnpm benchmark:algorithms
```

This compares:

- Fixed Window Counter
- Sliding Window Log
- Sliding Window Counter
- Token Bucket

Measured dimensions:

- average latency
- p95 latency
- p99 latency
- approximate memory behavior
- allowed requests
- blocked requests

## Helpful commands

```bash
pnpm --filter api build
pnpm --filter api test -- --runInBand
pnpm --filter dashboard build
pnpm --filter @rlaas/shared build
pnpm --filter @rlaas/sdk build
pnpm --filter @rlaas/express-demo build
pnpm loadtest:gateway
pnpm benchmark:algorithms
```

## Documentation

- [docs/architecture.md](/e:/rlaas-platform/docs/architecture.md)
- [docs/algorithms.md](/e:/rlaas-platform/docs/algorithms.md)
- [docs/api-flow.md](/e:/rlaas-platform/docs/api-flow.md)
- [docs/setup.md](/e:/rlaas-platform/docs/setup.md)
- [docs/load-testing.md](/e:/rlaas-platform/docs/load-testing.md)
- [docs/benchmark-result.md](/e:/rlaas-platform/docs/benchmark-result.md)
- [docs/deployment.md](/e:/rlaas-platform/docs/deployment.md)

## Interview explanation

A good senior-level summary of this project is:

"RLaaS is designed as a programmable policy system rather than a single middleware snippet. PostgreSQL stores ownership, rules, and analytics. Redis handles the hot-path enforcement state. NestJS coordinates rule resolution and algorithm execution. The dashboard serves as the control plane, and the SDK is the application-facing integration boundary."

# RLaaS Backend

NestJS service that powers the RLaaS Platform: the public API, the gateway
endpoint, RBAC, audit logs, and Redis-backed rate-limit algorithms.

## What's in here

- NestJS application bootstrap and module wiring
- Prisma schema for PostgreSQL domain persistence
- Redis module using `ioredis`
- Health endpoint at `GET /api/v1/health`
- Gateway check endpoint at `POST /api/v1/gateway/check`
- Rule resolution by scope and priority
- Analytics endpoints built on `RequestLog` and `AnalyticsSnapshot`
- Four pluggable rate-limit algorithms:
  - Fixed Window Counter (Redis Lua)
  - Sliding Window Log (Redis sorted sets)
  - Sliding Window Counter (Redis counters)
  - Token Bucket (Redis Lua)

## Run locally

```bash
pnpm install
pnpm --filter @rlaas/backend prisma:generate
pnpm --filter @rlaas/backend prisma:migrate:dev
pnpm --filter @rlaas/backend db:seed
pnpm --filter @rlaas/backend build
pnpm --filter @rlaas/backend start:dev
```

`pnpm --filter @rlaas/backend db:seed` is intentionally a no-op and does not
create demo or mock records.

## Test

```bash
pnpm --filter @rlaas/backend test -- --runInBand
```

## Environment

See `.env.example` for required variables.

## Seed data

No mock or demo data is created by the seed script.

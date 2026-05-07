# RLaaS API

This package contains the current backend core of the RLaaS Platform:

- NestJS application bootstrap
- Prisma schema for PostgreSQL domain persistence
- Redis module using `ioredis`
- Health endpoint at `GET /api/v1/health`
- Gateway check endpoint at `POST /api/v1/gateway/check`
- Persisted rule resolution by scope and priority
- Analytics endpoints built on `RequestLog` and `AnalyticsSnapshot`
- Fixed Window Counter implementation backed by a Redis Lua script
- Sliding Window Log implementation backed by Redis sorted sets
- Sliding Window Counter implementation backed by Redis counters
- Token Bucket implementation backed by a Redis Lua script

## Run locally

```bash
pnpm install
pnpm --filter @rlaas/api prisma:generate
pnpm --filter @rlaas/api prisma:migrate:dev
pnpm --filter @rlaas/api db:seed
pnpm --filter @rlaas/api build
pnpm --filter @rlaas/api start:dev
```

## Test

```bash
pnpm --filter @rlaas/api test -- --runInBand
```

## Environment

See `.env.example` for required variables.

## Seed data

The seed script creates:

- one demo user
- one demo project
- one active API key
- five starter rate-limit rules
- sample request logs
- one daily analytics snapshot

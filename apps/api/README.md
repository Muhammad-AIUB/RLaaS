# RLaaS API

This package contains the current backend core of the RLaaS Platform:

- NestJS application bootstrap
- Prisma schema for PostgreSQL domain persistence
- Redis module using `ioredis`
- Health endpoint at `GET /api/health`
- Gateway check endpoint at `POST /api/gateway/check`
- Persisted rule resolution by scope and priority
- Fixed Window Counter implementation backed by a Redis Lua script
- Sliding Window Log implementation backed by Redis sorted sets
- Sliding Window Counter implementation backed by Redis counters
- Token Bucket implementation backed by a Redis Lua script

## Run locally

```bash
pnpm install
pnpm --filter api prisma:generate
pnpm --filter api build
pnpm --filter api start:dev
```

## Test

```bash
pnpm --filter api test -- --runInBand
```

## Environment

See `.env.example` for required variables.

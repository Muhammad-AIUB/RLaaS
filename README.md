# RLaaS Platform

Step 3 adds PostgreSQL persistence with Prisma models for the RLaaS domain.

## Current scope

- Monorepo root configured with pnpm workspaces
- NestJS API in `apps/api`
- PostgreSQL support with Prisma
- Redis integration via `ioredis`
- `POST /gateway/check` backed by Redis Lua scripts
- Gateway rule resolution from persisted `RateLimitRule` records
- `GET /health` for app and Redis health
- Swagger docs at `/docs`
- Four algorithm implementations:
- `fixed_window`
- `sliding_window_log`
- `sliding_window_counter`
- `token_bucket`
- Prisma models:
- `User`
- `Project`
- `ApiKey`
- `RateLimitRule`
- `RequestLog`
- `AnalyticsSnapshot`

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Copy env file:

```bash
cp apps/api/.env.example apps/api/.env
```

3. Generate the Prisma client:

```bash
pnpm --filter api prisma:generate
```

4. Start PostgreSQL, Redis, and the API:

```bash
docker compose up --build postgres redis api
```

5. Apply migrations:

```bash
pnpm --filter api prisma:migrate:dev
```

6. Open:

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/health`

## Example request

```bash
curl -X POST http://localhost:3000/api/gateway/check \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "demo-key",
    "ip": "203.0.113.10",
    "endpoint": "/api/products",
    "method": "GET",
    "userTier": "free"
  }'
```

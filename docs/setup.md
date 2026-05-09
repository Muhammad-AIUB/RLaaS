# Setup

## What this project needs

- Node.js 22+
- pnpm 10+
- Docker Desktop or Docker Engine
- optional: `k6` for load testing

## Local development setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Prepare environment files

Backend:

```bash
copy apps\api\.env.example apps\api\.env
```

Dashboard:

```bash
copy apps\dashboard\.env.example apps\dashboard\.env.local
```

Express demo:

```bash
copy examples\express-demo\.env.example examples\express-demo\.env
```

### 3. Start infrastructure

```bash
docker compose up --build
```

This starts:

- PostgreSQL
- Redis
- NestJS API
- Next.js dashboard

### 4. Generate Prisma client

```bash
pnpm --filter @rlaas/backend prisma:generate
```

### 5. Run migrations

Development migration flow:

```bash
pnpm --filter @rlaas/backend prisma:migrate:dev
```

Production-style migration flow:

```bash
pnpm --filter @rlaas/backend prisma:migrate:deploy
```

### 6. Run the seed step

```bash
pnpm --filter @rlaas/backend db:seed
```

The seed script is intentionally a no-op and does not create mock or demo data.

### 7. Open the platform

- Dashboard: `http://localhost:3001`
- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/v1/health`

### 8. Security settings

- Set `API_KEY_HASH_PEPPER` to a long random secret before issuing production API keys.
- `IDEMPOTENCY_TTL_SECONDS` controls how long `POST /api/v1/gateway/check` responses can be safely replayed.

## Useful commands

### Backend

```bash
pnpm --filter @rlaas/backend start:dev
pnpm --filter @rlaas/backend build
pnpm --filter @rlaas/backend test -- --runInBand
```

### Dashboard

```bash
pnpm --filter @rlaas/frontend dev
pnpm --filter @rlaas/frontend build
```

### Shared packages

```bash
pnpm --filter @rlaas/shared-types build
pnpm --filter @rlaas/express-sdk build
```

### SDK demo app

```bash
pnpm --filter @rlaas/express-demo dev
```

### Load testing

```bash
pnpm loadtest:gateway
```

### Algorithm benchmark

```bash
pnpm benchmark:algorithms
```

## API examples

### Register

```bash
curl -X POST http://localhost:3000/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"founder@rlaas.dev\",\"password\":\"StrongPassword123!\",\"fullName\":\"RLaaS Founder\"}"
```

### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"your-user@example.com\",\"password\":\"your_password\"}"
```

### Create project

```bash
curl -X POST http://localhost:3000/api/v1/projects ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Storefront API\",\"description\":\"Primary API shield\"}"
```

### Gateway check

```bash
curl -X POST http://localhost:3000/api/v1/gateway/check ^
  -H "Content-Type: application/json" ^
  -d "{\"apiKey\":\"YOUR_API_KEY\",\"ip\":\"203.0.113.10\",\"endpoint\":\"/api/products\",\"method\":\"GET\",\"userTier\":\"free\"}"
```

## SDK usage example

```ts
import express from 'express';
import { createRlaasMiddleware } from '@rlaas/express-sdk';

const app = express();

app.use(
  createRlaasMiddleware({
    apiKey: 'project_api_key',
    gatewayUrl: 'http://localhost:3000/api/v1/gateway/check',
    userTierResolver: (req) => req.user?.tier ?? 'free',
  }),
);
```

## Interview explanation

If asked how someone should evaluate the project locally, a good answer is:

"Clone it, start Docker, run Prisma generate and migrations, run the optional seed step, then open the dashboard. From there you can create real projects and rules, hit the gateway directly, run the Express demo, run k6 load tests, and benchmark the algorithms."

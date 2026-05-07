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
pnpm --filter @rlaas/api prisma:generate
```

### 5. Run migrations

Development migration flow:

```bash
pnpm --filter @rlaas/api prisma:migrate:dev
```

Production-style migration flow:

```bash
pnpm --filter @rlaas/api prisma:migrate:deploy
```

### 6. Seed demo data

```bash
pnpm --filter @rlaas/api db:seed
```

Seeded values:

- demo user email
- demo password
- demo admin and viewer collaborators
- demo project
- demo API key
- starter rules
- sample logs
- sample analytics snapshot

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
pnpm --filter @rlaas/api start:dev
pnpm --filter @rlaas/api build
pnpm --filter @rlaas/api test -- --runInBand
```

### Dashboard

```bash
pnpm --filter @rlaas/dashboard dev
pnpm --filter @rlaas/dashboard build
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
  -d "{\"email\":\"demo@rlaas.local\",\"password\":\"DemoPass123!\"}"
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
  -d "{\"apiKey\":\"rlaas_live_demo_seed_key_1234567890\",\"ip\":\"203.0.113.10\",\"endpoint\":\"/api/products\",\"method\":\"GET\",\"userTier\":\"free\"}"
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

"Clone it, start Docker, run Prisma generate and migrations, seed the demo data, then open the dashboard. From there you can manage projects and rules, hit the gateway directly, run the Express demo, run k6 load tests, and benchmark the algorithms."

# Deployment

## Goal

This guide explains how to deploy RLaaS Platform as a production-style system with:

- frontend on Vercel
- backend on Render, Railway, or Fly.io
- PostgreSQL on Neon or Supabase
- Redis on Upstash or Redis Cloud

The goal is not to force one hosting combination. It is to document a clean deployment shape that is easy to explain in interviews and practical to run in real environments.

## Recommended production topology

```text
+-------------------+      HTTPS       +-------------------+
|   Browser Users   | ---------------> | Next.js Dashboard |
| operators/admins  |                  |      Vercel       |
+-------------------+                  +---------+---------+
                                                 |
                                                 | HTTPS
                                                 v
                                      +---------------------+
                                      |     NestJS API      |
                                      | Render/Railway/Fly  |
                                      +----+-----------+----+
                                           |           |
                              metadata/logs|           |counters
                                           v           v
                                  +---------------+ +---------------+
                                  | PostgreSQL    | | Redis         |
                                  | Neon/Supabase | | Upstash/Cloud |
                                  +---------------+ +---------------+
```

## Deployment options

### Frontend

Recommended:

- Vercel

Why:

- native Next.js support
- simple preview deployments
- environment variable management
- fast CDN delivery for the dashboard

### Backend

Good options:

- Render
- Railway
- Fly.io

How to choose:

- Render: very simple service deployment, easy health checks, good for portfolio demos
- Railway: fast developer experience, easy env management, good for small full-stack projects
- Fly.io: more control over regions and networking, stronger story if you want to discuss infra depth

### PostgreSQL

Good options:

- Neon
- Supabase Postgres

Why:

- managed backups
- connection strings ready for Prisma
- good free and starter tiers for portfolio projects

### Redis

Good options:

- Upstash Redis
- Redis Cloud

Why:

- managed Redis without operating a VM
- simple connection details
- suitable for distributed counters and token-bucket state

## Environment variables

### Backend environment variables

Required for `apps/rlaas-backend-api`:

```env
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public
REDIS_HOST=your-redis-host
REDIS_PORT=6379
JWT_SECRET=replace-with-a-strong-secret
JWT_EXPIRES_IN=1d
RATE_LIMIT_DEFAULT_LIMIT=100
RATE_LIMIT_DEFAULT_WINDOW_SECONDS=60
RATE_LIMIT_DEFAULT_ALGORITHM=fixed_window
SEED_DEMO_EMAIL=demo@rlaas.local
SEED_DEMO_PASSWORD=DemoPass123!
SEED_DEMO_FULL_NAME=RLaaS Demo User
SEED_RAW_API_KEY=rlaas_live_demo_seed_key_1234567890
```

Notes:

- `JWT_SECRET` should be long and random in production.
- `SEED_*` values are only needed if you plan to run the seed script in that environment.
- some hosted Redis providers expose a single URL instead of host/port; if you later extend the app, that is a reasonable next refactor.

### Frontend environment variables

Required for `apps/rlaas-frontend-dashboard`:

```env
NEXT_PUBLIC_API_URL=https://your-api-domain.example.com
NEXT_INTERNAL_API_URL=https://your-api-domain.example.com
```

Notes:

- on Vercel, `NEXT_PUBLIC_API_URL` is used by browser-side requests
- `NEXT_INTERNAL_API_URL` is used by server-side proxy routes
- if the dashboard and API are deployed separately, both should point to the public API base URL

## Vercel frontend deployment

### Recommended steps

1. Import the repository into Vercel.
2. Set the project root to `apps/rlaas-frontend-dashboard`.
3. Configure environment variables:
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_INTERNAL_API_URL`
4. Confirm the build command if needed:

```bash
pnpm build
```

5. Confirm the install command if needed:

```bash
pnpm install --frozen-lockfile
```

6. Deploy.

### What to verify after deploy

- login page loads
- session cookie is set after login
- dashboard can reach the backend proxy routes
- analytics pages render without CORS or auth failures

## Render backend deployment

### Recommended steps

1. Create a new Web Service from the repository.
2. Set the root directory to `apps/rlaas-backend-api`.
3. Configure environment variables:
   - `DATABASE_URL`
   - `REDIS_HOST`
   - `REDIS_PORT`
   - `JWT_SECRET`
   - `JWT_EXPIRES_IN`
   - `RATE_LIMIT_DEFAULT_LIMIT`
   - `RATE_LIMIT_DEFAULT_WINDOW_SECONDS`
   - `RATE_LIMIT_DEFAULT_ALGORITHM`
4. Use a start command that applies migrations before serving traffic:

```bash
pnpm prisma:migrate:deploy && pnpm start:prod
```

5. Set the health check path to:

```text
/api/health
```

### What to verify after deploy

- health endpoint returns healthy
- Swagger opens if exposed publicly
- `/api/gateway/check` can reach Redis
- JWT auth works with real environment values

## Railway backend deployment

### Recommended steps

1. Create a new service from the repository.
2. Point the service at `apps/rlaas-backend-api`.
3. Add the same backend environment variables.
4. Run migrations during deploy:

```bash
pnpm prisma:migrate:deploy
```

5. Start the app:

```bash
pnpm start:prod
```

Railway is convenient if you also want to attach managed PostgreSQL or Redis from the same UI.

## Fly.io backend deployment

### Recommended steps

1. Create a Fly app for the API.
2. Build from `apps/rlaas-backend-api/Dockerfile`.
3. Set backend environment variables as Fly secrets.
4. Attach managed or external PostgreSQL and Redis.
5. Run migrations as a release command before promotion.

Fly.io is a good choice if you want to discuss:

- regional placement
- network topology
- container-first deployments

## Database deployment notes

### Neon

Use Neon when you want:

- simple Prisma connection strings
- easy branching and previews
- minimal operational overhead

After provisioning:

```bash
pnpm --filter @rlaas/backend-api prisma:migrate:deploy
```

### Supabase

Use Supabase when you want:

- hosted Postgres plus a broader platform
- a familiar operational dashboard

For RLaaS, Postgres is used as:

- the source of truth for users, projects, keys, and rules
- the durable store for logs and analytics snapshots

## Redis deployment notes

### Upstash

Use Upstash when you want:

- simple setup
- serverless-friendly managed Redis

### Redis Cloud

Use Redis Cloud when you want:

- more traditional managed Redis operations
- clearer scaling options for larger traffic

For RLaaS, Redis is used for:

- fixed-window counters
- sliding-window sorted-set state
- sliding-window current/previous counters
- token-bucket token state
- Lua-backed atomic operations

## Production deployment checklist

Before calling the platform production-ready, verify:

- `JWT_SECRET` is rotated from the development default
- PostgreSQL has backups enabled
- Redis is reachable from the backend deployment
- Prisma migrations run successfully in the target environment
- dashboard env vars point to the correct API base URL
- `NEXT_PUBLIC_API_URL` uses HTTPS
- `POST /api/gateway/check` works end to end with a real API key
- health endpoint is used by the hosting platform
- seed data is not unintentionally run in a public production environment
- logs are visible in your hosting provider
- CORS and cookie behavior are validated in the browser
- rate-limit defaults are explicitly set, not left implicit

## Common production issues and fixes

### 1. Dashboard cannot talk to the API

Symptoms:

- login fails
- analytics pages stay empty
- proxy routes return `500` or `401`

Typical fixes:

- verify `NEXT_PUBLIC_API_URL`
- verify `NEXT_INTERNAL_API_URL`
- make sure the API URL includes `https://`
- confirm the API is publicly reachable from Vercel

### 2. Prisma migration fails during deploy

Symptoms:

- service boots locally but not in hosted environments
- startup logs show migration or connection errors

Typical fixes:

- verify `DATABASE_URL`
- confirm the database allows the backend's network path
- run `pnpm --filter @rlaas/backend-api prisma:migrate:deploy` manually once if needed

### 3. Gateway check fails because Redis is unavailable

Symptoms:

- `/api/gateway/check` returns `500`
- health endpoint shows Redis problems

Typical fixes:

- verify `REDIS_HOST` and `REDIS_PORT`
- confirm provider firewall or IP allowlist settings
- make sure the backend region can reach the Redis region

### 4. Authentication works locally but fails in production

Symptoms:

- login succeeds but protected routes fail
- session appears to disappear between requests

Typical fixes:

- verify frontend env vars point to the correct API URL
- confirm the dashboard proxy routes are deployed
- confirm the backend returns stable JWT responses

### 5. Seed credentials leak into a shared environment

Symptoms:

- demo accounts or static API keys appear in a public deployment

Typical fixes:

- avoid running `db:seed` in public production
- use separate seed values for preview/demo environments
- rotate any accidentally exposed API keys immediately

## Recommended portfolio deployment story

If you want a simple and credible production story for interviews:

- dashboard on Vercel
- API on Render
- PostgreSQL on Neon
- Redis on Upstash

Why this combination works well:

- low ops burden
- easy to explain
- realistic separation of concerns
- enough production detail to discuss trade-offs without over-engineering

## Interview explanation

A strong senior-level summary is:

"I deployed the system as separate operational planes. The dashboard is optimized for frontend delivery on Vercel, while the NestJS API runs as a standalone service with managed Postgres and Redis behind it. That mirrors how the architecture is designed: durable state in Postgres, fast enforcement state in Redis, and a clean HTTP boundary between operator workflows and runtime gateway decisions."

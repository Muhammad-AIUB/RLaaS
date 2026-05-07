# Architecture

## Problem statement

RLaaS Platform exists to solve a common platform problem:

- teams already have APIs in production
- they need rate limiting without rewriting every service
- they need both enforcement and visibility
- they need something self-hostable and programmable

This project positions RLaaS as a control-plane plus gateway decision engine:

- the control-plane manages users, projects, API keys, rules, and analytics
- the gateway answers one question very quickly:
  should this request be allowed right now?

## System overview

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
|                            |
| Auth / Users / Projects    |
| API Keys / Rules           |
| Gateway / Analytics        |
+--------+----------+--------+
         |          |
metadata |          | counters
         v          v
+----------------+  +----------------+
|   PostgreSQL   |  |     Redis      |
| Prisma models  |  | atomic windows |
| logs/snapshots |  | lua scripts    |
+----------------+  +----------------+
              ^
              |
+-------------+--------------+
|     Client APIs / Apps     |
| Express demo / SDK users   |
+----------------------------+
```

## Monorepo layout

```text
rlaas-platform/
|-- apps/
|   |-- api/                     NestJS backend
|   `-- dashboard/               Next.js operator UI
|-- packages/
|   |-- express-sdk/             Express middleware SDK
|   `-- shared-types/            shared enums and interfaces
|-- examples/
|   `-- express-demo/            real SDK demo app
|-- benchmarks/       algorithm benchmark runner
|-- tests/load/       k6 gateway load tests
`-- docs/             architecture and runbooks
```

## Core responsibilities

### NestJS backend

The backend is split into focused modules:

- `auth`
- `users`
- `projects`
- `api-keys`
- `rules`
- `gateway`
- `rate-limiter`
- `algorithms`
- `analytics`
- `redis`
- `health`
- `prisma`

This keeps controllers thin and isolates business rules in services.

### PostgreSQL role

PostgreSQL is the source of truth for:

- identities and ownership
- projects and API keys
- configured rate-limit rules
- request logs
- analytics snapshots

Why PostgreSQL:

- durable relational state
- auditable request history
- easy aggregation for dashboards and reporting
- mature Prisma support

### Redis role

Redis handles hot-path enforcement state:

- counters
- sorted sets
- token bucket state
- Lua-backed atomic operations

Why Redis:

- low-latency in-memory access
- good primitives for counters and expirations
- predictable scaling for rate-limit coordination

### Dashboard role

The dashboard is the operator interface for:

- login and session management
- project creation
- API key generation and revocation
- rule creation and inspection
- analytics visualization

The dashboard talks to the backend through server-side proxy routes so the JWT remains in an `httpOnly` cookie.

### SDK role

The SDK is the integration surface for application teams.

Its job is to:

- detect request metadata
- call `POST /api/v1/gateway/check`
- allow the request on success
- return `429` when blocked

This decouples enforcement from application code.

## Backend request paths

There are two major request paths.

### Control-plane path

Used by operators and the dashboard:

- register/login
- create projects
- issue keys
- define rules
- inspect analytics

### Data-plane path

Used at runtime by client applications:

1. application receives request
2. SDK gathers metadata
3. SDK calls RLaaS gateway
4. gateway resolves project and rule
5. algorithm checks Redis state
6. backend returns `allowed` or `blocked`
7. request log is stored in PostgreSQL

## Rule precedence

Rule evaluation follows a deliberate order:

1. IP
2. API key
3. User tier
4. Endpoint
5. Global

Within a scope bucket:

- lower numeric `priority` wins
- `createdAt` is used as a deterministic tie-breaker

This makes policy interpretation predictable and explainable.

## Design choices worth discussing in interviews

### Why split control-plane and data-plane logic?

Because the operational concerns are different:

- control-plane values durability and manageability
- data-plane values low latency and deterministic behavior

### Why keep request logs in PostgreSQL instead of Redis?

Redis is optimized for transient enforcement state, not long-term analytics or auditability.

### Why support multiple algorithms?

Different APIs want different behavior:

- simple and cheap
- precise sliding fairness
- burst-friendly protection

RLaaS should let teams choose policy, not force one algorithm everywhere.

### Why a monorepo?

Because backend, dashboard, SDK, and shared types evolve together:

- easier contract alignment
- simpler developer onboarding
- shared CI and release workflows

## Interview explanation

A strong senior-level summary is:

"I designed RLaaS as a programmable policy system rather than just a middleware snippet. PostgreSQL stores ownership, rules, and analytics. Redis owns the hot-path counters. NestJS coordinates rule selection and algorithm execution. The dashboard acts as the control plane, and the SDK is the application-facing integration point. That separation lets the system stay understandable while still feeling production-oriented."

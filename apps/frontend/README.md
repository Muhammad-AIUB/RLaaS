# RLaaS Frontend

Next.js operator dashboard for the RLaaS Platform.

## What's in here

- Login and registration pages
- Protected dashboard overview
- Projects list and project details
- API key management
- Rules management with priority and scope controls
- Analytics views built on Recharts
- Audit logs and webhooks management
- BFF proxy routes that keep the JWT in an `httpOnly` cookie

## Run locally

```bash
pnpm install
cp .env.example .env.local
pnpm --filter @rlaas/backend start:dev   # in another terminal
pnpm --filter @rlaas/frontend dev
```

The dashboard is served at `http://localhost:3001`.

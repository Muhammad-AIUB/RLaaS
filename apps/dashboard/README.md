# RLaaS Dashboard

Next.js dashboard for the RLaaS Platform with:

- login and registration pages
- protected dashboard overview
- projects list and project details
- API key management
- rules management
- analytics views with Recharts
- backend proxy routes that keep the JWT in an `httpOnly` cookie

## Run locally

```bash
pnpm install
copy .env.example .env.local
pnpm --filter api start:dev
pnpm --filter dashboard build
pnpm --filter dashboard dev
```

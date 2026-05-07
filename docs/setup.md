# Setup Notes

Current setup uses:

- PostgreSQL for persistence
- Redis for rate-limit counters
- NestJS API for gateway and control-plane backend

Useful commands:

```bash
pnpm install
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev
docker compose up --build postgres redis api
```

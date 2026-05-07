FROM node:22-alpine AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/rlaas-frontend-dashboard/package.json apps/rlaas-frontend-dashboard/package.json

RUN pnpm install --filter @rlaas/frontend-dashboard... --frozen-lockfile

FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/rlaas-frontend-dashboard/node_modules ./apps/rlaas-frontend-dashboard/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY . .

RUN pnpm --filter @rlaas/frontend-dashboard build

FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/apps/rlaas-frontend-dashboard ./apps/rlaas-frontend-dashboard

EXPOSE 3001

CMD ["node", "apps/rlaas-frontend-dashboard/node_modules/next/dist/bin/next", "start", "apps/rlaas-frontend-dashboard", "--port", "3001"]

FROM node:22-alpine AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/rlaas-backend-api/package.json apps/rlaas-backend-api/package.json

RUN pnpm install --filter @rlaas/backend-api... --frozen-lockfile

FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/rlaas-backend-api/node_modules ./apps/rlaas-backend-api/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY . .

RUN pnpm --filter @rlaas/backend-api exec prisma generate
RUN pnpm --filter @rlaas/backend-api build

FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/apps/rlaas-backend-api ./apps/rlaas-backend-api

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @rlaas/backend-api prisma:migrate:deploy && node apps/rlaas-backend-api/dist/main.js"]

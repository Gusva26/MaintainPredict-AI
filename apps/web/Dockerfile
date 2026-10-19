# ───── deps ─────
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
# Monorepo pnpm: hay que copiar el workspace + los manifiestos de cada paquete
# antes de instalar, si no pnpm no resuelve dependencias.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile || pnpm install

# ───── dev (usado por docker-compose dev con volumen montado) ─────
FROM node:20-alpine AS dev
WORKDIR /app
RUN corepack enable
# En pnpm cada workspace tiene su propio node_modules (p. ej. apps/web/node_modules),
# por eso copiamos el /app completo instalado en `deps`, no solo el node_modules raíz.
COPY --from=deps /app ./
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

# ───── build ─────
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ───── prod ─────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

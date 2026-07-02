# syntax=docker/dockerfile:1

FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@9.0.0 --activate

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml turbo.json .npmrc* ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/
COPY packages/db/package.json packages/db/tsconfig.json ./packages/db/
COPY packages/maps-tools/package.json packages/maps-tools/tsconfig.json ./packages/maps-tools/

RUN pnpm install

COPY . .

# Generate Prisma client and build
RUN pnpm --filter db db:generate
RUN pnpm build

# Runtime stage
FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built backend
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Copy built frontend standalone
COPY --from=builder /app/apps/web/.next/standalone ./apps/web/
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/

# Copy packages
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/node_modules/.pnpm/@prisma+client* ./node_modules/.pnpm/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy workspace node_modules selectively
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/maps-tools/dist ./packages/maps-tools/dist
COPY --from=builder /app/packages/maps-tools/package.json ./packages/maps-tools/

# Copy root package files
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./

EXPOSE 3000 3001

CMD ["node", "apps/api/dist/index.js"]

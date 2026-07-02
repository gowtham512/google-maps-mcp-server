# syntax=docker/dockerfile:1
FROM node:20-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace files and install dependencies
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/
COPY packages/db/package.json packages/db/tsconfig.json ./packages/db/
COPY packages/maps-tools/package.json packages/maps-tools/tsconfig.json ./packages/maps-tools/

RUN pnpm install

# Copy source and build
COPY . .

RUN pnpm --filter db db:generate
RUN pnpm build

# Expose ports for API and web
EXPOSE 3000 3001

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/data/maps-agent.db

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Default command starts the API. docker-compose overrides this for the web service.
CMD ["/usr/local/bin/docker-entrypoint.sh"]
